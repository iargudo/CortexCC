import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type BellNotification = {
  id: string;
  title: string;
  message: string;
  at: string;
  read: boolean;
  conversationId?: string;
};

type State = {
  items: BellNotification[];
  add: (entry: { title: string; message: string; conversationId?: string }) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
};

const MAX = 50;
/** No mostrar en la campana ni restaurar notificaciones más viejas que esto. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const STORAGE_KEY = "cortex-cc-bell-notifications";

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function pruneOld(items: BellNotification[]): BellNotification[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return items.filter((i) => {
    const t = new Date(i.at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

export const useBellNotificationsStore = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      add: (entry) =>
        set({
          items: pruneOld([
            {
              id: newId(),
              title: entry.title,
              message: entry.message,
              at: new Date().toISOString(),
              read: false,
              conversationId: entry.conversationId,
            },
            ...get().items,
          ]).slice(0, MAX),
        }),
      markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
      markRead: (id) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, read: true } : i)) })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Pick<State, "items">> | undefined;
        const raw = Array.isArray(p?.items) ? p!.items : [];
        return {
          ...current,
          items: pruneOld(raw).slice(0, MAX),
        };
      },
    }
  )
);
