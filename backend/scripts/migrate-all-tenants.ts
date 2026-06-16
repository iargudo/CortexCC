import "dotenv/config";
import { execSync } from "node:child_process";
import { masterPrisma } from "../src/lib/masterPrisma.js";

async function main(): Promise<void> {
  const tenants = await masterPrisma.tenant.findMany({
    where: { is_active: true },
    select: {
      tenant_key: true,
      database_host: true,
      database_port: true,
      database_user: true,
      database_password: true,
      database_name: true,
    },
  });

  if (tenants.length === 0) {
    console.log("No active tenants in Master.");
    return;
  }

  const failures: string[] = [];

  for (const tenant of tenants) {
    console.log(`\n--- Migrating tenant: ${tenant.tenant_key} ---`);
    try {
      execSync("npm run migrate:tenant", {
        stdio: "inherit",
        env: {
          ...process.env,
          TENANT_DB_HOST: tenant.database_host,
          TENANT_DB_PORT: String(tenant.database_port),
          TENANT_DB_USER: tenant.database_user,
          TENANT_DB_PASSWORD: tenant.database_password,
          TENANT_DB_NAME: tenant.database_name,
        },
      });
      console.log(`OK: ${tenant.tenant_key}`);
    } catch (err) {
      console.error(`FAIL: ${tenant.tenant_key}`, err);
      failures.push(tenant.tenant_key);
    }
  }

  await masterPrisma.$disconnect();

  if (failures.length > 0) {
    console.error(`\nMigration failed for tenants: ${failures.join(", ")}`);
    process.exit(1);
  }

  console.log("\nAll tenant migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
