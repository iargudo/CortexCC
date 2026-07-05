import { execSync } from "node:child_process";
import { masterPrisma } from "../lib/masterPrisma.js";

function tenantDatabaseUrl(tenant: {
  database_host: string;
  database_port: number;
  database_user: string;
  database_password: string;
  database_name: string;
}): string {
  const { database_host, database_port, database_user, database_password, database_name } = tenant;
  return `postgresql://${encodeURIComponent(database_user)}:${encodeURIComponent(database_password)}@${database_host}:${database_port}/${database_name}`;
}

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
      execSync("npx prisma migrate deploy", {
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: tenantDatabaseUrl(tenant),
        },
      });
      console.log(`OK: ${tenant.tenant_key}`);
    } catch (err) {
      console.error(`FAIL: ${tenant.tenant_key}`, err);
      failures.push(tenant.tenant_key);
    }
  }

  if (failures.length > 0) {
    console.error(`\nMigration failed for tenants: ${failures.join(", ")}`);
    process.exit(1);
  }

  console.log("\nAll tenant migrations complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await masterPrisma.$disconnect();
  });
