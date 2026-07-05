/** Debe coincidir con backend/src/lib/postgresUtil.ts normalizeTenantHost */
export function normalizeTenantHost(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let v = value.trim();
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
      v = new URL(v).hostname;
    }
  } catch {
    /* ignore */
  }
  v = (v.split("/")[0] ?? v).split(":")[0]?.trim() ?? v;
  return v.toLowerCase() || null;
}

export function normalizeSubdomainInput(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(v)) return null;
  return v;
}
