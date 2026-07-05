import "dotenv/config";
/**
 * Bootstrap del primer tenant desde variables de entorno (solo deploy automatizado).
 * Alta operativa de tenants: panel /platform o API POST /api/platform/tenants
 *
 * Tras migrar la BD tenant aplica la línea base (roles + org settings).
 * La configuración de empresa (p. ej. Puntonet) va aparte: npm run setup:puntonet
 */
import { masterPrisma } from "../src/lib/masterPrisma.js";
import { parsePostgresUrl } from "../src/lib/postgresUtil.js";
import { createTenant } from "../src/services/platform/tenantProvisioning.service.js";

async function main(): Promise<void> {
  const key = process.env.TENANT_KEY?.trim();
  const name = process.env.TENANT_NAME?.trim();
  if (!key || !name) {
    console.error("Missing TENANT_KEY and/or TENANT_NAME");
    process.exit(1);
  }

  const existing = await masterPrisma.tenant.findUnique({ where: { tenant_key: key } });
  if (existing) {
    console.log(`Tenant "${key}" already registered in Master; skipping.`);
    return;
  }

  const seed = process.env.TENANT_SEED === "true";

  let dbName = process.env.TENANT_DB_NAME?.trim();
  if (!dbName && process.env.DATABASE_URL?.trim()) {
    dbName = parsePostgresUrl(process.env.DATABASE_URL.trim()).database;
  }

  const tenant = await createTenant({
    key,
    name,
    subdomain: process.env.TENANT_SUBDOMAIN?.trim() || key,
    customDomain: process.env.TENANT_CUSTOM_DOMAIN?.trim() || null,
    skipDbCreate: process.env.TENANT_SKIP_DB_CREATE === "true",
    seed,
    db: dbName ? { dbName } : undefined,
  });

  console.log(`Tenant "${tenant.tenant_key}" registered (${tenant.database_name}).`);
  if (!seed) {
    console.log("Línea base aplicada. Ejecuta setup:puntonet (u otra config de empresa) si corresponde.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await masterPrisma.$disconnect();
  });
