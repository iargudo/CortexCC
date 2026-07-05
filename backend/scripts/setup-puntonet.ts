import "dotenv/config";
import { runPuntonetSetup } from "../src/bootstrap/puntonetSetup.js";

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
  const defaultPassword = process.env.PUNTONET_DEFAULT_PASSWORD ?? "PuntonetVentas2026!";
  console.log("Configurando operación Puntonet (sobre línea base del tenant)...");

  const result = await runPuntonetSetup(buildTenantDatabaseUrl(), defaultPassword);

  console.log("\n--- Puntonet configurado ---");
  console.log(`Rotación:       ${result.rotation_group}`);
  console.log(`Coordinaciones: ${result.coordinations}`);
  console.log(`Clave inicial:  ${result.default_password}`);
  console.log("\nPendiente: apiKey/phoneNumberId de 360Dialog en cada canal WhatsApp.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
