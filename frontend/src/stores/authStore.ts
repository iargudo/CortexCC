import { create } from "zustand";
import type { AgentStatus } from "@/data/mock";
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  apiJson,
  clearTokens,
  setTokens,
} from "@/lib/api";
import { disconnectSocket, reconnectSocket } from "@/lib/socket";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  status: AgentStatus;
  max_concurrent: number;
}

interface AuthState {
  hydrated: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setStatus: (status: AgentStatus) => Promise<void>;
  updateProfile: (data: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  isAuthenticated: false,
  user: null,

  hydrate: async () => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      set({ hydrated: true, isAuthenticated: false, user: null });
      return;
    }
    try {
      const user = await apiJson<AuthUser>("/auth/me");
      set({ isAuthenticated: true, user, hydrated: true });
      reconnectSocket();
    } catch {
      clearTokens();
      disconnectSocket();
      set({ isAuthenticated: false, user: null, hydrated: true });
    }
  },

  login: async (email, password) => {
    const out = await apiJson<{
      token: string;
      refreshToken: string;
      user: AuthUser;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setTokens(out.token, out.refreshToken);
    set({ isAuthenticated: true, user: out.user, hydrated: true });
    reconnectSocket();
  },

  logout: async () => {
    const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
    try {
      if (rt) {
        await apiJson("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken: rt }),
        });
      }
    } catch {
      /* ignore */
    }
    clearTokens();
    disconnectSocket();
    set({ isAuthenticated: false, user: null, hydrated: true });
  },

  setStatus: async (status) => {
    const updated = await apiJson<AuthUser>("/auth/status", {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    set({ user: updated });
  },

  updateProfile: (data) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...data } : null,
    })),
}));
