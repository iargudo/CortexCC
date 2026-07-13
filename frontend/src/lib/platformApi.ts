export const PLATFORM_ACCESS_TOKEN_KEY = "cortexcc_platform_access_token";
export const PLATFORM_REFRESH_TOKEN_KEY = "cortexcc_platform_refresh_token";

export function getApiBase(): string {
  const v = import.meta.env.VITE_API_URL as string | undefined;
  if (v?.trim()) return v.replace(/\/$/, "");
  return "http://localhost:3037/api";
}

function getPlatformAccessToken(): string | null {
  return localStorage.getItem(PLATFORM_ACCESS_TOKEN_KEY);
}

function getPlatformRefreshToken(): string | null {
  return localStorage.getItem(PLATFORM_REFRESH_TOKEN_KEY);
}

export function setPlatformTokens(access: string, refresh?: string | null): void {
  localStorage.setItem(PLATFORM_ACCESS_TOKEN_KEY, access);
  if (refresh) localStorage.setItem(PLATFORM_REFRESH_TOKEN_KEY, refresh);
}

export function clearPlatformTokens(): void {
  localStorage.removeItem(PLATFORM_ACCESS_TOKEN_KEY);
  localStorage.removeItem(PLATFORM_REFRESH_TOKEN_KEY);
}

let refreshPromise: Promise<string | null> | null = null;

async function tryPlatformRefresh(): Promise<string | null> {
  const rt = getPlatformRefreshToken();
  if (!rt) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${getApiBase()}/platform/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (data.token) {
        setPlatformTokens(data.token, rt);
        return data.token;
      }
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function platformFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  const token = getPlatformAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    init.body !== undefined &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(url, { ...init, headers });
  if (res.status === 401 && getPlatformRefreshToken()) {
    const newTok = await tryPlatformRefresh();
    if (newTok) {
      const h2 = new Headers(init.headers);
      h2.set("Authorization", `Bearer ${newTok}`);
      if (
        init.body !== undefined &&
        typeof init.body === "string" &&
        !h2.has("Content-Type")
      ) {
        h2.set("Content-Type", "application/json");
      }
      res = await fetch(url, { ...init, headers: h2 });
    }
  }
  return res;
}

export async function platformJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await platformFetch(path, init);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type PlatformTenant = {
  id: string;
  tenant_key: string;
  display_name: string;
  subdomain: string | null;
  custom_domain: string | null;
  database_host: string;
  database_port: number;
  database_user: string;
  database_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlatformAdmin = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  name: string;
  role: "admin";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MigrateAllResult = {
  results: { tenant_key: string; ok: boolean; error?: string }[];
  failed_count: number;
  success_count: number;
};

export type TenantDatabaseInspectResult = {
  ok: boolean;
  error?: string;
  connection_ms?: number;
  postgres_version?: string;
  database_size?: string;
  table_counts: Record<string, number>;
  migrations: { migration_name: string; finished_at: string | null }[];
  checked_at: string;
};
