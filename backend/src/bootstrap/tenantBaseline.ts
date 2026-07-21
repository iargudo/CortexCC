import { PrismaClient } from "@prisma/client";
import { defaultRolePermissions } from "../lib/permissions.js";

const BASELINE_ROLES = ["admin", "supervisor", "coordinator", "agent"] as const;

export type TenantBaselineOptions = {
  companyName?: string;
  timezone?: string;
};

export type TenantBaselineResult = {
  ok: true;
  roles: string[];
};

/** Configuración mínima de un tenant recién migrado (sin operación de empresa). */
export async function applyTenantBaseline(
  prisma: PrismaClient,
  options: TenantBaselineOptions = {}
): Promise<TenantBaselineResult> {
  await prisma.organizationSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      company_name: options.companyName ?? "Cortex Contact",
      timezone: options.timezone ?? "America/Guayaquil",
      language: "es",
      default_country_code: "EC",
      sip_extension_range_start: 7001,
      sip_extension_range_end: 7099,
    },
    update: {
      ...(options.companyName ? { company_name: options.companyName } : {}),
      ...(options.timezone ? { timezone: options.timezone } : {}),
    },
  });

  for (const roleName of BASELINE_ROLES) {
    const defaults = defaultRolePermissions[roleName] ?? {};
    const existing = await prisma.role.findUnique({ where: { name: roleName } });
    if (!existing) {
      await prisma.role.create({ data: { name: roleName, permissions: defaults } });
      continue;
    }
    // Defaults primero; lo persistido gana (preserva customizaciones de Roles).
    // Así claves nuevas (p. ej. transfer) se rellenan sin pisar overrides.
    const current =
      existing.permissions && typeof existing.permissions === "object" && !Array.isArray(existing.permissions)
        ? (existing.permissions as Record<string, boolean>)
        : {};
    await prisma.role.update({
      where: { name: roleName },
      data: { permissions: { ...defaults, ...current } },
    });
  }

  return { ok: true, roles: [...BASELINE_ROLES] };
}

export async function runTenantBaseline(
  databaseUrl: string,
  options: TenantBaselineOptions = {}
): Promise<TenantBaselineResult> {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    return await applyTenantBaseline(prisma, options);
  } finally {
    await prisma.$disconnect();
  }
}
