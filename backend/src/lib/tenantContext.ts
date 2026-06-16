import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContextStore {
  tenantKey: string;
  tenantName: string;
}

const tenantStorage = new AsyncLocalStorage<TenantContextStore>();

export function getTenantContext(): TenantContextStore | undefined {
  return tenantStorage.getStore();
}

export function getCurrentTenantKey(): string {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error("No tenant context available for this request");
  }
  return ctx.tenantKey;
}

export function getCurrentTenantName(): string {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error("No tenant context available for this request");
  }
  return ctx.tenantName;
}

export function runWithTenant<T>(
  tenantKey: string,
  tenantName: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return tenantStorage.run({ tenantKey, tenantName }, fn);
}

export { tenantStorage };
