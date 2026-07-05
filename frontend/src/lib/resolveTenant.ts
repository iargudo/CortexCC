import { getApiBase } from "./api";
import { setTenant } from "./tenantStorage";

export type ResolvedTenant = {
  key: string;
  name: string;
};

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Override desde panel platform: /login?tenant_key=...&tenant_name=... */
export function readTenantFromQuery(): ResolvedTenant | null {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("tenant_key")?.trim();
  if (!key) return null;
  const name = params.get("tenant_name")?.trim() || key;
  return { key, name };
}

export async function resolveTenant(): Promise<ResolvedTenant> {
  const fromQuery = readTenantFromQuery();
  if (fromQuery) {
    setTenant(fromQuery.key, fromQuery.name);
    return fromQuery;
  }

  const hostname = window.location.hostname;

  if (isLocalDevHost(hostname)) {
    const key = import.meta.env.VITE_TENANT_KEY?.trim();
    if (!key) {
      throw new Error("VITE_TENANT_KEY is required for local development");
    }
    const name = import.meta.env.VITE_TENANT_NAME?.trim() || key;
    const tenant = { key, name };
    setTenant(tenant.key, tenant.name);
    return tenant;
  }

  const url = `${getApiBase()}/tenants/resolve?host=${encodeURIComponent(hostname)}`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error("DOMAIN_NOT_CONFIGURED");
  }
  if (!res.ok) {
    throw new Error("Failed to resolve tenant");
  }
  const data = (await res.json()) as { key: string; name: string };
  setTenant(data.key, data.name);
  return { key: data.key, name: data.name };
}
