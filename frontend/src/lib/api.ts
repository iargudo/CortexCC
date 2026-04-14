/** localStorage keys (must match socket.ts) */
export const ACCESS_TOKEN_KEY = "cortexcc_access_token";
export const REFRESH_TOKEN_KEY = "cortexcc_refresh_token";

export function getApiBase(): string {
  const v = import.meta.env.VITE_API_URL as string | undefined;
  if (v?.trim()) return v.replace(/\/$/, "");
  return "http://localhost:3030/api";
}

/** Socket.IO server origin (no path). Default: same host as API without /api */
export function getWsOrigin(): string {
  const v = import.meta.env.VITE_WS_URL as string | undefined;
  if (v?.trim()) return v.replace(/\/$/, "");
  return getApiBase().replace(/\/api\/?$/, "") || "http://localhost:3030";
}

export function getSocketPath(): string {
  return (import.meta.env.VITE_SOCKET_PATH as string | undefined)?.trim() || "/socket.io";
}

function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(access: string, refresh?: string | null): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${getApiBase()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (data.token) {
        setTokens(data.token, rt);
        return data.token;
      }
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    init.body !== undefined &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(url, { ...init, headers });

  if (res.status === 401 && getRefreshToken()) {
    const newTok = await tryRefresh();
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

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
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
