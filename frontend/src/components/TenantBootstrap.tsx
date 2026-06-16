import { useEffect } from "react";
import { useTenantStore } from "@/stores/tenantStore";

export function TenantBootstrap() {
  const bootstrapTenant = useTenantStore((s) => s.bootstrapTenant);
  const tenantResolved = useTenantStore((s) => s.tenantResolved);

  useEffect(() => {
    if (!tenantResolved) {
      void bootstrapTenant();
    }
  }, [bootstrapTenant, tenantResolved]);

  return null;
}
