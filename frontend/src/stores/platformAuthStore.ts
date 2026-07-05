import { create } from "zustand";
import {
  clearPlatformTokens,
  platformJson,
  setPlatformTokens,
  PLATFORM_ACCESS_TOKEN_KEY,
  type PlatformAdmin,
} from "@/lib/platformApi";

interface PlatformAuthState {
  hydrated: boolean;
  isAuthenticated: boolean;
  user: PlatformAdmin | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const usePlatformAuthStore = create<PlatformAuthState>((set) => ({
  hydrated: false,
  isAuthenticated: false,
  user: null,

  hydrate: async () => {
    const token = localStorage.getItem(PLATFORM_ACCESS_TOKEN_KEY);
    if (!token) {
      set({ hydrated: true, isAuthenticated: false, user: null });
      return;
    }
    try {
      const user = await platformJson<PlatformAdmin>("/platform/auth/me");
      set({ isAuthenticated: true, user, hydrated: true });
    } catch {
      clearPlatformTokens();
      set({ isAuthenticated: false, user: null, hydrated: true });
    }
  },

  login: async (email, password) => {
    const out = await platformJson<{
      token: string;
      refreshToken: string;
      user: PlatformAdmin;
    }>("/platform/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setPlatformTokens(out.token, out.refreshToken);
    set({ isAuthenticated: true, user: out.user, hydrated: true });
  },

  logout: async () => {
    const rt = localStorage.getItem("cortexcc_platform_refresh_token");
    try {
      if (rt) {
        await platformJson("/platform/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken: rt }),
        });
      }
    } catch {
      /* ignore */
    }
    clearPlatformTokens();
    set({ isAuthenticated: false, user: null, hydrated: true });
  },
}));
