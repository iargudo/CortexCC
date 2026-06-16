import "dotenv/config";
import { execSync } from "node:child_process";

function buildTenantDatabaseUrl(): string {
  const host = process.env.TENANT_DB_HOST?.trim();
  const port = process.env.TENANT_DB_PORT?.trim() ?? "5432";
  const user = process.env.TENANT_DB_USER?.trim();
  const password = process.env.TENANT_DB_PASSWORD?.trim();
  const name = process.env.TENANT_DB_NAME?.trim();

  if (host && user && password && name) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return databaseUrl;
  }

  console.error("Set TENANT_DB_* or DATABASE_URL for migrate-tenant");
  process.exit(1);
}

const databaseUrl = buildTenantDatabaseUrl();
console.log(`Running prisma migrate deploy for tenant DB...`);

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl },
});

console.log("Tenant migrations complete.");
