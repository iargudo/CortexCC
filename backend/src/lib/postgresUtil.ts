import pg from "pg";

export type PostgresConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

function sslModeFromUrl(url: string): string | undefined {
  return new URL(url).searchParams.get("sslmode")?.toLowerCase();
}

/** Opciones pg.Client respetando sslmode de la URL (Azure Postgres requiere SSL). */
export function pgClientConfig(url: string, database?: string): pg.ClientConfig {
  const cfg = parsePostgresUrl(url);
  const sslmode = sslModeFromUrl(url);
  const azureHost = cfg.host.includes(".postgres.database.azure.com");

  let ssl: pg.ClientConfig["ssl"];
  if (sslmode === "disable") {
    ssl = undefined;
  } else if (sslmode === "verify-full" || sslmode === "verify-ca") {
    ssl = { rejectUnauthorized: true };
  } else if (sslmode === "require" || sslmode === "prefer" || sslmode === "allow" || azureHost) {
    ssl = { rejectUnauthorized: false };
  }

  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: database ?? cfg.database,
    ssl,
  };
}

/** Hostname sin protocolo, puerto ni path (p. ej. app.empresa.com o 192.168.1.10). */
export function normalizeTenantHost(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let v = value.trim();
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
      v = new URL(v).hostname;
    }
  } catch {
    /* usar v tal cual */
  }
  v = (v.split("/")[0] ?? v).split(":")[0]?.trim() ?? v;
  return v.toLowerCase() || null;
}

export function isIpAddressHost(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

export function normalizeSubdomain(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const v = value.trim().toLowerCase();
  if (!SLUG_RE.test(v)) return null;
  return v;
}

export function parsePostgresUrl(url: string): PostgresConfig {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

export function buildPostgresUrl(cfg: PostgresConfig): string {
  const user = encodeURIComponent(cfg.user);
  const password = encodeURIComponent(cfg.password);
  return `postgresql://${user}:${password}@${cfg.host}:${cfg.port}/${cfg.database}`;
}

export function adminPostgresUrl(masterUrl: string): string {
  const cfg = parsePostgresUrl(masterUrl);
  return masterUrl.replace(`/${cfg.database}`, "/postgres");
}

export async function ensureDatabaseExists(adminUrl: string, dbName: string): Promise<void> {
  const client = new pg.Client(pgClientConfig(adminUrl, "postgres"));
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

export async function dropDatabaseIfExists(adminUrl: string, dbName: string): Promise<void> {
  const client = new pg.Client(pgClientConfig(adminUrl, "postgres"));
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

export function defaultTenantDbName(tenantKey: string): string {
  return `cortexcontact_${tenantKey.replace(/-/g, "_")}`;
}
