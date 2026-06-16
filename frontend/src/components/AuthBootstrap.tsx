import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useTenantStore } from "@/stores/tenantStore";

/** Restaura sesión desde tokens en localStorage (GET /auth/me). */
export function AuthBootstrap() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const tenantResolved = useTenantStore((s) => s.tenantResolved);
  const tenantError = useTenantStore((s) => s.tenantError);

  useEffect(() => {
    if (tenantResolved && !tenantError) {
      void hydrate();
    }
  }, [hydrate, tenantResolved, tenantError]);

  return null;
}
