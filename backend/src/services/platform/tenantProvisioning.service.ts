import { execSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { masterPrisma } from "../../lib/masterPrisma.js";
import {
  adminPostgresUrl,
  buildPostgresUrl,
  defaultTenantDbName,
  dropDatabaseIfExists,
  ensureDatabaseExists,
  normalizeSubdomain,
  normalizeTenantHost,
  parsePostgresUrl,
  pgClientConfig,
  SLUG_RE,
  type PostgresConfig,
} from "../../lib/postgresUtil.js";
import { invalidateTenantConnection } from "../../lib/tenantConnectionManager.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { env } from "../../config/env.js";
import { runTenantBaseline, type TenantBaselineResult } from "../../bootstrap/tenantBaseline.js";
import { runPuntonetSetup, type PuntonetSetupResult } from "../../bootstrap/puntonetSetup.js";

export type TenantDbConfig = {
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbName: string;
};

export type CreateTenantInput = {
  key: string;
  name: string;
  subdomain?: string | null;
  customDomain?: string | null;
  db?: Partial<TenantDbConfig>;
  skipDbCreate?: boolean;
  skipMigrate?: boolean;
  /** Demo local (admin@cortex.local, cola General, etc.). No usar en producción. */
  seed?: boolean;
};

export type CloneTenantInput = {
  sourceKey: string;
  newKey: string;
  newName: string;
  subdomain?: string | null;
  customDomain?: string | null;
  dbName?: string;
  skipMigrate?: boolean;
};

function masterDefaults(): TenantDbConfig {
  const cfg = parsePostgresUrl(env.MASTER_DATABASE_URL);
  return {
    dbHost: cfg.host,
    dbPort: cfg.port,
    dbUser: cfg.user,
    dbPassword: cfg.password,
    dbName: cfg.database,
  };
}

export function resolveTenantDbConfig(input: Partial<TenantDbConfig> | undefined, tenantKey: string): TenantDbConfig {
  const defaults = masterDefaults();
  return {
    dbHost: input?.dbHost ?? defaults.dbHost,
    dbPort: input?.dbPort ?? defaults.dbPort,
    dbUser: input?.dbUser ?? defaults.dbUser,
    dbPassword: input?.dbPassword ?? defaults.dbPassword,
    dbName: input?.dbName ?? defaultTenantDbName(tenantKey),
  };
}

function toDbUrl(cfg: TenantDbConfig): string {
  return buildPostgresUrl({
    host: cfg.dbHost,
    port: cfg.dbPort,
    user: cfg.dbUser,
    password: cfg.dbPassword,
    database: cfg.dbName,
  });
}

export function runTenantMigrate(cfg: TenantDbConfig): void {
  try {
    execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: toDbUrl(cfg) },
    });
  } catch (err) {
    const message =
      err instanceof Error && "stderr" in err && typeof (err as { stderr?: string }).stderr === "string"
        ? (err as { stderr: string }).stderr
        : err instanceof Error
          ? err.message
          : String(err);
    throw new HttpError(500, `Tenant migration failed: ${message.slice(0, 500)}`);
  }
}

function runTenantSeed(cfg: TenantDbConfig): void {
  execSync("npm run seed:tenant", {
    stdio: "pipe",
    env: {
      ...process.env,
      TENANT_DB_HOST: cfg.dbHost,
      TENANT_DB_PORT: String(cfg.dbPort),
      TENANT_DB_USER: cfg.dbUser,
      TENANT_DB_PASSWORD: cfg.dbPassword,
      TENANT_DB_NAME: cfg.dbName,
    },
  });
}

async function applyTenantBaseline(cfg: TenantDbConfig, companyName: string): Promise<TenantBaselineResult> {
  return runTenantBaseline(toDbUrl(cfg), { companyName });
}

async function assertNoTenantConflicts(input: {
  key: string;
  subdomain: string | null;
  customDomain: string | null;
  excludeKey?: string;
}): Promise<void> {
  const others = await masterPrisma.tenant.findMany({
    where: {
      ...(input.excludeKey ? { NOT: { tenant_key: input.excludeKey } } : {}),
    },
    select: { tenant_key: true, subdomain: true, custom_domain: true },
  });

  for (const existing of others) {
    if (existing.tenant_key === input.key) {
      throw new HttpError(409, `Conflict: tenant_key already registered (${existing.tenant_key})`);
    }
    if (input.subdomain && existing.subdomain === input.subdomain) {
      throw new HttpError(409, `Conflict: subdomain already registered (${existing.tenant_key})`);
    }
    if (
      input.customDomain &&
      normalizeTenantHost(existing.custom_domain) === input.customDomain
    ) {
      throw new HttpError(409, `Conflict: custom_domain already registered (${existing.tenant_key})`);
    }
  }
}

export function validateTenantKey(key: string): void {
  if (!SLUG_RE.test(key)) {
    throw new HttpError(400, `Invalid tenant key "${key}". Use lowercase letters, digits and hyphens (2-32 chars).`);
  }
}

export function sanitizeTenantForResponse(tenant: {
  id: string;
  tenant_key: string;
  display_name: string;
  subdomain: string | null;
  custom_domain: string | null;
  database_host: string;
  database_port: number;
  database_user: string;
  database_password: string;
  database_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: tenant.id,
    tenant_key: tenant.tenant_key,
    display_name: tenant.display_name,
    subdomain: tenant.subdomain,
    custom_domain: tenant.custom_domain,
    database_host: tenant.database_host,
    database_port: tenant.database_port,
    database_user: tenant.database_user,
    database_name: tenant.database_name,
    is_active: tenant.is_active,
    created_at: tenant.created_at,
    updated_at: tenant.updated_at,
  };
}

export async function createTenant(input: CreateTenantInput) {
  validateTenantKey(input.key);
  const subdomain = normalizeSubdomain(input.subdomain?.trim() || input.key);
  if (!subdomain) {
    throw new HttpError(400, `Invalid subdomain for tenant "${input.key}"`);
  }
  const customDomain = normalizeTenantHost(input.customDomain);

  const db = resolveTenantDbConfig(input.db, input.key);
  await assertNoTenantConflicts({
    key: input.key,
    subdomain,
    customDomain: customDomain ?? null,
  });

  const adminUrl = adminPostgresUrl(env.MASTER_DATABASE_URL);
  if (!input.skipDbCreate) {
    await ensureDatabaseExists(adminUrl, db.dbName);
  }
  if (!input.skipMigrate) {
    runTenantMigrate(db);
  }
  if (input.seed) {
    runTenantSeed(db);
  } else {
    await applyTenantBaseline(db, input.name);
  }

  const tenant = await masterPrisma.tenant.create({
    data: {
      tenant_key: input.key,
      display_name: input.name,
      subdomain,
      custom_domain: customDomain,
      database_host: db.dbHost,
      database_port: db.dbPort,
      database_user: db.dbUser,
      database_password: db.dbPassword,
      database_name: db.dbName,
      is_active: true,
    },
  });

  return sanitizeTenantForResponse(tenant);
}

export async function migrateTenantByKey(tenantKey: string): Promise<{ tenant_key: string; ok: true }> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { tenant_key: tenantKey } });
  if (!tenant) throw new HttpError(404, "Tenant not found");

  runTenantMigrate({
    dbHost: tenant.database_host,
    dbPort: tenant.database_port,
    dbUser: tenant.database_user,
    dbPassword: tenant.database_password,
    dbName: tenant.database_name,
  });
  return { tenant_key: tenantKey, ok: true };
}

export async function migrateAllTenants(options?: { activeOnly?: boolean }) {
  const tenants = await masterPrisma.tenant.findMany({
    where: options?.activeOnly === false ? undefined : { is_active: true },
    orderBy: { tenant_key: "asc" },
  });

  const results: { tenant_key: string; ok: boolean; error?: string }[] = [];
  for (const tenant of tenants) {
    try {
      runTenantMigrate({
        dbHost: tenant.database_host,
        dbPort: tenant.database_port,
        dbUser: tenant.database_user,
        dbPassword: tenant.database_password,
        dbName: tenant.database_name,
      });
      results.push({ tenant_key: tenant.tenant_key, ok: true });
    } catch (err) {
      results.push({
        tenant_key: tenant.tenant_key,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return { results, failed_count: failed.length, success_count: results.length - failed.length };
}

async function cloneDatabaseWithPgDump(source: PostgresConfig, target: PostgresConfig): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), "cortexcc-clone-"));
  const dumpPath = join(tmpDir, "dump.sql");
  try {
    const sourceUrl = buildPostgresUrl(source);
    const targetUrl = buildPostgresUrl(target);
    execSync(`pg_dump "${sourceUrl}" --no-owner --no-acl --format=plain --file="${dumpPath}"`, {
      stdio: "pipe",
    });
    execSync(`psql "${targetUrl}" -v ON_ERROR_STOP=1 -f "${dumpPath}"`, { stdio: "pipe" });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function cloneTenant(input: CloneTenantInput) {
  validateTenantKey(input.newKey);
  const subdomain = normalizeSubdomain(input.subdomain?.trim() || input.newKey);
  if (!subdomain) {
    throw new HttpError(400, `Invalid subdomain for tenant "${input.newKey}"`);
  }
  const customDomain = normalizeTenantHost(input.customDomain);

  const source = await masterPrisma.tenant.findUnique({ where: { tenant_key: input.sourceKey } });
  if (!source) throw new HttpError(404, "Source tenant not found");

  const db = resolveTenantDbConfig(
    {
      dbHost: source.database_host,
      dbPort: source.database_port,
      dbUser: source.database_user,
      dbPassword: source.database_password,
      dbName: input.dbName ?? defaultTenantDbName(input.newKey),
    },
    input.newKey
  );

  await assertNoTenantConflicts({
    key: input.newKey,
    subdomain,
    customDomain: customDomain ?? null,
  });

  const adminUrl = adminPostgresUrl(env.MASTER_DATABASE_URL);
  await ensureDatabaseExists(adminUrl, db.dbName);

  await cloneDatabaseWithPgDump(
    {
      host: source.database_host,
      port: source.database_port,
      user: source.database_user,
      password: source.database_password,
      database: source.database_name,
    },
    {
      host: db.dbHost,
      port: db.dbPort,
      user: db.dbUser,
      password: db.dbPassword,
      database: db.dbName,
    }
  );

  if (!input.skipMigrate) {
    runTenantMigrate(db);
  }

  const tenant = await masterPrisma.tenant.create({
    data: {
      tenant_key: input.newKey,
      display_name: input.newName,
      subdomain,
      custom_domain: customDomain,
      database_host: db.dbHost,
      database_port: db.dbPort,
      database_user: db.dbUser,
      database_password: db.dbPassword,
      database_name: db.dbName,
      is_active: true,
    },
  });

  return sanitizeTenantForResponse(tenant);
}

export async function updateTenant(
  tenantKey: string,
  input: {
    display_name?: string;
    subdomain?: string | null;
    custom_domain?: string | null;
    is_active?: boolean;
    database_host?: string;
    database_port?: number;
    database_user?: string;
    database_password?: string;
    database_name?: string;
  }
) {
  const existing = await masterPrisma.tenant.findUnique({ where: { tenant_key: tenantKey } });
  if (!existing) throw new HttpError(404, "Tenant not found");

  let subdomain = existing.subdomain;
  if (input.subdomain !== undefined) {
    if (!input.subdomain?.trim()) {
      subdomain = null;
    } else {
      const normalized = normalizeSubdomain(input.subdomain);
      if (!normalized) {
        throw new HttpError(
          400,
          `Invalid subdomain "${input.subdomain}". Use lowercase letters, digits and hyphens.`
        );
      }
      subdomain = normalized;
    }
  }

  let customDomain = existing.custom_domain;
  if (input.custom_domain !== undefined) {
    customDomain = normalizeTenantHost(input.custom_domain);
  }

  await assertNoTenantConflicts({
    key: tenantKey,
    subdomain,
    customDomain,
    excludeKey: tenantKey,
  });

  const tenant = await masterPrisma.tenant.update({
    where: { tenant_key: tenantKey },
    data: {
      ...(input.display_name !== undefined ? { display_name: input.display_name.trim() } : {}),
      ...(input.subdomain !== undefined ? { subdomain } : {}),
      ...(input.custom_domain !== undefined ? { custom_domain: customDomain } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      ...(input.database_host !== undefined ? { database_host: input.database_host } : {}),
      ...(input.database_port !== undefined ? { database_port: input.database_port } : {}),
      ...(input.database_user !== undefined ? { database_user: input.database_user } : {}),
      ...(input.database_password !== undefined ? { database_password: input.database_password } : {}),
      ...(input.database_name !== undefined ? { database_name: input.database_name } : {}),
    },
  });

  await invalidateTenantConnection(tenantKey);
  return sanitizeTenantForResponse(tenant);
}

export async function deleteTenant(tenantKey: string, options?: { dropDatabase?: boolean }) {
  const existing = await masterPrisma.tenant.findUnique({ where: { tenant_key: tenantKey } });
  if (!existing) throw new HttpError(404, "Tenant not found");

  await masterPrisma.tenant.delete({ where: { tenant_key: tenantKey } });
  await invalidateTenantConnection(tenantKey);

  if (options?.dropDatabase) {
    const adminUrl = adminPostgresUrl(env.MASTER_DATABASE_URL);
    await dropDatabaseIfExists(adminUrl, existing.database_name);
  }

  return { deleted: tenantKey, database_dropped: Boolean(options?.dropDatabase) };
}

export async function listTenants() {
  const tenants = await masterPrisma.tenant.findMany({ orderBy: { tenant_key: "asc" } });
  return tenants.map(sanitizeTenantForResponse);
}

export async function getTenant(tenantKey: string) {
  const tenant = await masterPrisma.tenant.findUnique({ where: { tenant_key: tenantKey } });
  if (!tenant) throw new HttpError(404, "Tenant not found");
  return sanitizeTenantForResponse(tenant);
}

export type TenantDatabaseInspectResult = {
  ok: boolean;
  error?: string;
  connection_ms?: number;
  postgres_version?: string;
  database_size?: string;
  table_counts: Record<string, number>;
  migrations: { migration_name: string; finished_at: string | null }[];
  checked_at: string;
};

function tenantRowToDbConfig(
  tenant: {
    database_host: string;
    database_port: number;
    database_user: string;
    database_password: string;
    database_name: string;
  },
  overrides?: Partial<TenantDbConfig>
): TenantDbConfig {
  return {
    dbHost: overrides?.dbHost?.trim() || tenant.database_host,
    dbPort: overrides?.dbPort ?? tenant.database_port,
    dbUser: overrides?.dbUser?.trim() || tenant.database_user,
    dbPassword:
      overrides?.dbPassword !== undefined && overrides.dbPassword !== ""
        ? overrides.dbPassword
        : tenant.database_password,
    dbName: overrides?.dbName?.trim() || tenant.database_name,
  };
}

export async function inspectTenantDatabase(
  tenantKey: string,
  overrides?: Partial<TenantDbConfig>
): Promise<TenantDatabaseInspectResult> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { tenant_key: tenantKey } });
  if (!tenant) throw new HttpError(404, "Tenant not found");

  const db = tenantRowToDbConfig(tenant, overrides);
  const url = buildPostgresUrl({
    host: db.dbHost,
    port: db.dbPort,
    user: db.dbUser,
    password: db.dbPassword,
    database: db.dbName,
  });

  const client = new pg.Client(pgClientConfig(url));
  const started = Date.now();
  const tableNames = ["users", "conversations", "contacts", "messages", "channels", "queues"];

  try {
    await client.connect();
    const connectionMs = Date.now() - started;

    const versionRow = await client.query<{ version: string }>("SELECT version() AS version");
    const sizeRow = await client.query<{ size: string }>(
      "SELECT pg_size_pretty(pg_database_size(current_database())) AS size"
    );

    const tableCounts: Record<string, number> = {};
    for (const table of tableNames) {
      try {
        const countRow = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM "${table.replace(/"/g, '""')}"`
        );
        tableCounts[table] = countRow.rows[0]?.count ?? 0;
      } catch {
        tableCounts[table] = -1;
      }
    }

    let migrations: { migration_name: string; finished_at: string | null }[] = [];
    try {
      const migrationRows = await client.query<{ migration_name: string; finished_at: Date | null }>(
        `SELECT migration_name, finished_at
         FROM _prisma_migrations
         ORDER BY finished_at DESC NULLS LAST
         LIMIT 25`
      );
      migrations = migrationRows.rows.map((row) => ({
        migration_name: row.migration_name,
        finished_at: row.finished_at?.toISOString() ?? null,
      }));
    } catch {
      migrations = [];
    }

    return {
      ok: true,
      connection_ms: connectionMs,
      postgres_version: versionRow.rows[0]?.version,
      database_size: sizeRow.rows[0]?.size,
      table_counts: tableCounts,
      migrations,
      checked_at: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      table_counts: {},
      migrations: [],
      checked_at: new Date().toISOString(),
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function seedBaselineForTenant(
  tenantKey: string
): Promise<TenantBaselineResult & { tenant_key: string }> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { tenant_key: tenantKey } });
  if (!tenant) throw new HttpError(404, "Tenant not found");

  const result = await runTenantBaseline(
    buildPostgresUrl({
      host: tenant.database_host,
      port: tenant.database_port,
      user: tenant.database_user,
      password: tenant.database_password,
      database: tenant.database_name,
    }),
    { companyName: tenant.display_name }
  );
  await invalidateTenantConnection(tenantKey);
  return { tenant_key: tenantKey, ...result };
}

export async function setupPuntonetForTenant(
  tenantKey: string,
  options?: { defaultPassword?: string }
): Promise<PuntonetSetupResult & { tenant_key: string }> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { tenant_key: tenantKey } });
  if (!tenant) throw new HttpError(404, "Tenant not found");

  const url = buildPostgresUrl({
    host: tenant.database_host,
    port: tenant.database_port,
    user: tenant.database_user,
    password: tenant.database_password,
    database: tenant.database_name,
  });

  const result = await runPuntonetSetup(url, options?.defaultPassword);
  await invalidateTenantConnection(tenantKey);
  return { tenant_key: tenantKey, ...result };
}
