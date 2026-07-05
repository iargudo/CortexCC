import "dotenv/config";
import { runTenantBaseline } from "../src/bootstrap/tenantBaseline.js";

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
  if (databaseUrl) return databaseUrl;

  throw new Error("Set TENANT_DB_* or DATABASE_URL");
}

async function main(): Promise<void> {
  const companyName = process.env.TENANT_BASELINE_COMPANY?.trim() || process.env.TENANT_NAME?.trim();
  console.log("Aplicando línea base del tenant...");

  const result = await runTenantBaseline(buildTenantDatabaseUrl(), {
    companyName: companyName || undefined,
  });

  console.log(`Línea base OK — roles: ${result.roles.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
