import { create } from "zustand";
import { resolveTenant } from "@/lib/resolveTenant";
import { clearTokens } from "@/lib/api";
import { clearTenant, getStoredTenantKey } from "@/lib/tenantStorage";

interface TenantState {
  tenantResolved: boolean;
  tenantKey: string | null;
  tenantName: string | null;
  tenantError: string | null;
  bootstrapTenant: () => Promise<void>;
}

export const useTenantStore = create<TenantState>((set) => ({
  tenantResolved: false,
  tenantKey: null,
  tenantName: null,
  tenantError: null,

  bootstrapTenant: async () => {
    try {
      const previousKey = getStoredTenantKey();
      const tenant = await resolveTenant();
      if (previousKey && previousKey !== tenant.key) {
        clearTokens();
      }
      set({
        tenantResolved: true,
        tenantKey: tenant.key,
        tenantName: tenant.name,
        tenantError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "TENANT_RESOLVE_FAILED";
      if (message !== "DOMAIN_NOT_CONFIGURED") {
        clearTenant();
      }
      set({
        tenantResolved: true,
        tenantKey: null,
        tenantName: null,
        tenantError: message,
      });
    }
  },
}));
