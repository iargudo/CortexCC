/** localStorage keys (must match socket.ts) */
import { getStoredTenantKey } from "./tenantStorage";

export const ACCESS_TOKEN_KEY = "cortexcc_access_token";
export const REFRESH_TOKEN_KEY = "cortexcc_refresh_token";

export function getApiBase(): string {
  const v = import.meta.env.VITE_API_URL as string | undefined;
  if (v?.trim()) return v.replace(/\/$/, "");
  return "http://localhost:3037/api";
}

/** Socket.IO server origin (no path). Default: same host as API without /api */
export function getWsOrigin(): string {
  const v = import.meta.env.VITE_WS_URL as string | undefined;
  if (v?.trim()) return v.replace(/\/$/, "");
  return getApiBase().replace(/\/api\/?$/, "") || "http://localhost:3037";
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

function buildApiHeaders(init: RequestInit = {}): Headers {
  const headers = new Headers(init.headers);
  const tenantKey = getStoredTenantKey();
  if (tenantKey) headers.set("X-Tenant-Key", tenantKey);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    init.body !== undefined &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export function setTokens(access: string, refresh?: string | null): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** Nombre del evento emitido cuando una sesión queda inválida y no se puede refrescar. */
export const AUTH_EXPIRED_EVENT = "cortexcc:auth-expired";

function notifyAuthExpired(): void {
  clearTokens();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
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
        headers: buildApiHeaders({ body: JSON.stringify({ refreshToken: rt }) }),
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

/** Endpoints de autenticación donde un 401 es esperable y no debe forzar logout. */
function isAuthEndpoint(path: string): boolean {
  return (
    path.includes("/auth/login") ||
    path.includes("/auth/refresh") ||
    path.includes("/auth/logout")
  );
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = buildApiHeaders(init);

  let res = await fetch(url, { ...init, headers });

  if (res.status === 401 && getAccessToken() && !isAuthEndpoint(path)) {
    if (getRefreshToken()) {
      const newTok = await tryRefresh();
      if (newTok) {
        const h2 = buildApiHeaders(init);
        h2.set("Authorization", `Bearer ${newTok}`);
        res = await fetch(url, { ...init, headers: h2 });
      }
    }
    // El token es inválido/expirado y no se pudo refrescar: limpiar sesión y avisar a la app
    // para forzar re-login en lugar de dejar al usuario atrapado con 401 repetidos.
    if (res.status === 401) {
      notifyAuthExpired();
    }
  }

  return res;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    let msg = res.statusText;
    let details: unknown;
    try {
      const j = (await res.json()) as { error?: string; details?: unknown };
      if (j.error) msg = j.error;
      details = j.details;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status, details);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }

  get code(): string | undefined {
    if (this.details && typeof this.details === "object" && "code" in this.details) {
      const c = (this.details as { code?: unknown }).code;
      return typeof c === "string" ? c : undefined;
    }
    return undefined;
  }
}

export function isAgentEligibilityError(err: unknown): err is ApiError {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  return err.code === "AGENT_STATUS_BLOCKED" || err.code === "AGENT_AT_CAPACITY";
}
