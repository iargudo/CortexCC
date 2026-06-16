import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

function parseMasterUrl(url: string): { host: string; port: number; user: string; password: string; database: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

async function ensureDatabaseExists(adminUrl: string, dbName: string): Promise<void> {
  const cfg = parseMasterUrl(adminUrl);
  const client = new pg.Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: "postgres",
  });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log(`Created database: ${dbName}`);
  } else {
    console.log(`Database already exists: ${dbName}`);
  }
  await client.end();
}

async function main(): Promise<void> {
  const masterUrl = requireEnv("MASTER_DATABASE_URL");
  const cfg = parseMasterUrl(masterUrl);

  const adminUrl = masterUrl.replace(`/${cfg.database}`, "/postgres");
  await ensureDatabaseExists(adminUrl, cfg.database);

  console.log("Pushing master schema (tenants table)...");
  execSync("npx prisma db push --schema=prisma/master.schema.prisma --skip-generate", {
    stdio: "inherit",
    env: process.env,
  });

  execSync("npx prisma generate --schema=prisma/master.schema.prisma", {
    stdio: "inherit",
    env: process.env,
  });

  const seedLocal = process.env.SEED_LOCAL_TENANT === "true";
  if (seedLocal) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error("SEED_LOCAL_TENANT=true requires DATABASE_URL for tenant local credentials");
      process.exit(1);
    }
    const tenantCfg = parseMasterUrl(databaseUrl);
    const { PrismaClient } = await import("@prisma/client-master");
    const master = new PrismaClient();
    await master.tenant.upsert({
      where: { tenant_key: "local" },
      create: {
        tenant_key: "local",
        display_name: process.env.LOCAL_TENANT_NAME ?? "Desarrollo Local",
        subdomain: "local",
        database_host: tenantCfg.host,
        database_port: tenantCfg.port,
        database_user: tenantCfg.user,
        database_password: tenantCfg.password,
        database_name: tenantCfg.database,
        is_active: true,
      },
      update: {
        display_name: process.env.LOCAL_TENANT_NAME ?? "Desarrollo Local",
        subdomain: "local",
        database_host: tenantCfg.host,
        database_port: tenantCfg.port,
        database_user: tenantCfg.user,
        database_password: tenantCfg.password,
        database_name: tenantCfg.database,
        is_active: true,
      },
    });
    await master.$disconnect();
    console.log("Registered tenant 'local' in Master");
  }

  console.log("Master setup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
