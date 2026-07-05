import type { PrismaClient } from "@prisma/client";
import type { Tenant } from "@prisma/client-master";
import { PrismaClient as TenantPrismaClient } from "@prisma/client";
import { masterPrisma } from "./masterPrisma.js";
import { getTenantContext } from "./tenantContext.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isIpAddressHost, normalizeTenantHost } from "./postgresUtil.js";

const tenantClients = new Map<string, PrismaClient>();
const tenantInfoCache = new Map<string, { key: string; name: string }>();
const tenantConnectionSignatures = new Map<string, string>();

function connectionSignature(
  tenant: Pick<Tenant, "database_host" | "database_port" | "database_user" | "database_password" | "database_name">
): string {
  return buildPostgresUrl(tenant);
}

async function evictTenantClient(tenantKey: string): Promise<void> {
  const client = tenantClients.get(tenantKey);
  if (client) {
    await client.$disconnect();
    tenantClients.delete(tenantKey);
  }
  tenantConnectionSignatures.delete(tenantKey);
  tenantInfoCache.delete(tenantKey);
}

function buildPostgresUrl(tenant: Pick<Tenant, "database_host" | "database_port" | "database_user" | "database_password" | "database_name">): string {
  const user = encodeURIComponent(tenant.database_user);
  const password = encodeURIComponent(tenant.database_password);
  return `postgresql://${user}:${password}@${tenant.database_host}:${tenant.database_port}/${tenant.database_name}`;
}

function createTenantClient(tenant: Tenant): PrismaClient {
  return new TenantPrismaClient({
    datasources: { db: { url: buildPostgresUrl(tenant) } },
    log:
      process.env.NODE_ENV === "development"
        ? process.env.PRISMA_LOG_QUERIES === "true"
          ? ["query", "error", "warn"]
          : ["error", "warn"]
        : ["error"],
  });
}

async function findActiveTenant(tenantKey: string): Promise<Tenant> {
  const tenant = await masterPrisma.tenant.findFirst({
    where: { tenant_key: tenantKey, is_active: true },
  });
  if (!tenant) {
    await evictTenantClient(tenantKey);
    throw new HttpError(404, `Tenant not found or inactive: ${tenantKey}`);
  }
  return tenant;
}

export async function ensureConnection(tenantKey: string): Promise<{ key: string; name: string }> {
  const tenant = await findActiveTenant(tenantKey);
  const info = { key: tenant.tenant_key, name: tenant.display_name };

  const signature = connectionSignature(tenant);
  const cachedSignature = tenantConnectionSignatures.get(tenantKey);
  if (cachedSignature && cachedSignature !== signature) {
    await evictTenantClient(tenantKey);
  }

  if (!tenantClients.has(tenantKey)) {
    tenantClients.set(tenantKey, createTenantClient(tenant));
    tenantConnectionSignatures.set(tenantKey, signature);
  }

  tenantInfoCache.set(tenantKey, info);
  return info;
}

export async function invalidateTenantConnection(tenantKey: string): Promise<void> {
  await evictTenantClient(tenantKey);
}

export function getPrisma(): PrismaClient {
  const ctx = getTenantContext();
  if (!ctx) {
    throw new Error("getPrisma() called outside tenant context");
  }
  const client = tenantClients.get(ctx.tenantKey);
  if (!client) {
    throw new Error(`No Prisma client for tenant: ${ctx.tenantKey}`);
  }
  return client;
}

export function getTenantInfo(tenantKey: string): { key: string; name: string } | null {
  return tenantInfoCache.get(tenantKey) ?? null;
}

function extractSubdomain(host: string): string | null {
  const normalized = host.toLowerCase().split(":")[0] ?? host;
  if (normalized === "localhost" || normalized === "127.0.0.1" || isIpAddressHost(normalized)) {
    return null;
  }
  const parts = normalized.split(".");
  if (parts.length < 3) {
    return parts[0] ?? null;
  }
  return parts[0] ?? null;
}

async function findTenantByCustomDomain(host: string): Promise<Tenant | null> {
  const normalized = normalizeTenantHost(host);
  if (!normalized) return null;

  const direct = await masterPrisma.tenant.findFirst({
    where: { custom_domain: normalized, is_active: true },
  });
  if (direct) return direct;

  const candidates = await masterPrisma.tenant.findMany({
    where: { is_active: true, custom_domain: { not: null } },
  });
  return (
    candidates.find((t) => normalizeTenantHost(t.custom_domain) === normalized) ?? null
  );
}

export async function resolveByHost(host: string): Promise<{ key: string; name: string } | null> {
  const byCustom = await findTenantByCustomDomain(host);
  if (byCustom) {
    return { key: byCustom.tenant_key, name: byCustom.display_name };
  }

  const normalized = host.toLowerCase().split(":")[0] ?? host;
  const subdomain = extractSubdomain(normalized);
  if (!subdomain) {
    return null;
  }

  const bySubdomain = await masterPrisma.tenant.findFirst({
    where: { subdomain, is_active: true },
  });
  if (bySubdomain) {
    return { key: bySubdomain.tenant_key, name: bySubdomain.display_name };
  }

  return null;
}

export async function listActiveTenants(): Promise<Tenant[]> {
  return masterPrisma.tenant.findMany({ where: { is_active: true } });
}

export async function disconnectAllTenants(): Promise<void> {
  await Promise.all([...tenantClients.values()].map((c) => c.$disconnect()));
  tenantClients.clear();
  tenantInfoCache.clear();
  tenantConnectionSignatures.clear();
}

export async function disconnectMaster(): Promise<void> {
  await masterPrisma.$disconnect();
}
