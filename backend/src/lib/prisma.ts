import { getPrisma as getTenantPrisma } from "./tenantConnectionManager.js";

/** Tenant-scoped Prisma client (requires active tenant context). */
export function getPrisma() {
  return getTenantPrisma();
}
