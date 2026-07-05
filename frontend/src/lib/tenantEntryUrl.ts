import type { PlatformTenant } from "./platformApi";
import { normalizeTenantHost } from "./normalizeTenantHost";

type TenantEntry = Pick<
  PlatformTenant,
  "tenant_key" | "display_name" | "custom_domain" | "subdomain" | "is_active"
>;

function isIpOrLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host)
  );
}

/** URL de login del tenant (desde panel platform o tras alta). */
export function buildTenantLoginUrl(tenant: TenantEntry): string {
  const params = new URLSearchParams({
    tenant_key: tenant.tenant_key,
    tenant_name: tenant.display_name,
  });
  const query = params.toString();

  const host = normalizeTenantHost(tenant.custom_domain);
  if (host) {
    const protocol = isIpOrLocalHost(host) ? window.location.protocol : "https:";
    const port =
      isIpOrLocalHost(host) && window.location.port ? `:${window.location.port}` : "";
    return `${protocol}//${host}${port}/login?${query}`;
  }

  return `${window.location.origin}/login?${query}`;
}

export function openTenantLogin(tenant: TenantEntry): void {
  if (!tenant.is_active) return;
  window.open(buildTenantLoginUrl(tenant), "_blank", "noopener,noreferrer");
}
