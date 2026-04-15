import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation, ChannelType } from "@/data/mock";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatArea } from "@/components/inbox/ChatArea";
import { ContextPanel } from "@/components/inbox/ContextPanel";
import { apiJson } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/authStore";

export default function InboxPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationFromUrl = searchParams.get("conversation");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const showAllTab = user?.role === "admin" || user?.role === "supervisor";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "queue" | "all">("mine");
  const [channelFilter, setChannelFilter] = useState<ChannelType | null>(null);

  useEffect(() => {
    if (tab === "all" && !showAllTab) setTab("mine");
  }, [tab, showAllTab]);

  useEffect(() => {
    if (conversationFromUrl) setSelectedId(conversationFromUrl);
  }, [conversationFromUrl]);

  useEffect(() => {
    if (!selectedId) return;
    setSearchParams(
      (prev) => {
        if (prev.get("conversation") === selectedId) return prev;
        const next = new URLSearchParams(prev);
        next.set("conversation", selectedId);
        return next;
      },
      { replace: true }
    );
  }, [selectedId, setSearchParams]);

  const listQuery = useQuery({
    queryKey: ["conversations", tab, channelFilter],
    enabled: isAuthenticated,
    queryFn: async () => {
      const q = new URLSearchParams({ tab, limit: "50", page: "1" });
      if (channelFilter) q.set("channel", channelFilter);
      return apiJson<{ data: Conversation[]; meta: { total: number } }>(
        `/conversations?${q.toString()}`
      );
    },
  });

  const conversations = listQuery.data?.data ?? [];

  const detailQuery = useQuery({
    queryKey: ["conversation", selectedId],
    enabled: Boolean(selectedId) && isAuthenticated,
    queryFn: () => apiJson<Conversation>(`/conversations/${selectedId}`),
    retry: (count, err) => {
      const msg = err instanceof Error ? err.message : "";
      if (/403|404|acceso|Not found/i.test(msg)) return false;
      return count < 2;
    },
  });

  const selected = useMemo(() => {
    if (!selectedId || detailQuery.isError) return null;
    if (detailQuery.data?.id === selectedId) return detailQuery.data;
    return conversations.find((c) => c.id === selectedId) ?? null;
  }, [selectedId, detailQuery.data, detailQuery.isError, conversations]);

  /** No pisar selección por URL ni forzar otra conv. si el detalle aún carga o falló. */
  useEffect(() => {
    if (!listQuery.isSuccess) return;
    if (!conversations.length) {
      if (selectedId || conversationFromUrl) {
        setSelectedId(null);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("conversation");
            return next;
          },
          { replace: true }
        );
      }
      return;
    }
    if (conversationFromUrl && selectedId === conversationFromUrl) return;
    if (!selectedId || !conversations.some((c) => c.id === selectedId)) {
      setSelectedId(conversations[0].id);
    }
  }, [listQuery.isSuccess, conversations, selectedId, conversationFromUrl, setSearchParams]);

  useEffect(() => {
    const s = getSocket();
    if (!s || !selectedId || !isAuthenticated) return;
    s.emit("conversation:join", { conversationId: selectedId });
    return () => {
      s.emit("conversation:leave", { conversationId: selectedId });
    };
  }, [selectedId, isAuthenticated]);

  useEffect(() => {
    const s = getSocket();
    if (!s || !isAuthenticated) return;
    const bump = (payload: { conversationId?: string }) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      if (payload.conversationId) {
        void qc.invalidateQueries({ queryKey: ["conversation", payload.conversationId] });
      }
    };
    const bumpList = () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    };
    s.on("message:new", bump);
    s.on("message:delivery_update", bump);
    s.on("conversation:assigned", bumpList);
    s.on("queue:updated", bumpList);
    return () => {
      s.off("message:new", bump);
      s.off("message:delivery_update", bump);
      s.off("conversation:assigned", bumpList);
      s.off("queue:updated", bumpList);
    };
  }, [isAuthenticated, qc]);

  useEffect(() => {
    if (!detailQuery.isError || !selectedId) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("conversation");
        return next;
      },
      { replace: true }
    );
    const fallback = conversations.find((c) => c.id !== selectedId)?.id ?? null;
    setSelectedId(fallback);
  }, [detailQuery.isError, selectedId, conversations, setSearchParams]);

  let center: ReactNode;
  if (listQuery.isLoading) {
    center = (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Cargando bandeja…
      </div>
    );
  } else if (listQuery.isError) {
    center = (
      <div className="flex-1 flex items-center justify-center text-destructive text-sm px-4 text-center">
        {(listQuery.error as Error).message}
      </div>
    );
  } else if (selectedId && detailQuery.isError) {
    center = (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground text-sm">
        <p>No se pudo abrir esta conversación.</p>
        <p className="text-xs">Comprueba permisos o elige otra en la lista.</p>
      </div>
    );
  } else if (selected) {
    center = (
      <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
        <ChatArea conversation={selected} />
        <ContextPanel conversation={selected} />
      </div>
    );
  } else {
    center = (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>{conversations.length ? "Selecciona una conversación" : "No hay conversaciones"}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <ConversationList
        conversations={conversations}
        highlightId={selectedId}
        selected={selected}
        onSelect={(c) => {
          setSelectedId(c.id);
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set("conversation", c.id);
              return next;
            },
            { replace: true }
          );
        }}
        tab={tab}
        onTabChange={setTab}
        channelFilter={channelFilter}
        onChannelFilterChange={setChannelFilter}
        showAllTab={showAllTab}
      />
      {center}
    </div>
  );
}
