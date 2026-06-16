export const TENANT_KEY_STORAGE = "cortexcc_tenant_key";
export const TENANT_NAME_STORAGE = "cortexcc_tenant_name";

export function getStoredTenantKey(): string | null {
  return localStorage.getItem(TENANT_KEY_STORAGE);
}

export function getStoredTenantName(): string | null {
  return localStorage.getItem(TENANT_NAME_STORAGE);
}

export function setTenant(key: string, name: string): void {
  localStorage.setItem(TENANT_KEY_STORAGE, key);
  localStorage.setItem(TENANT_NAME_STORAGE, name);
}

export function clearTenant(): void {
  localStorage.removeItem(TENANT_KEY_STORAGE);
  localStorage.removeItem(TENANT_NAME_STORAGE);
}
