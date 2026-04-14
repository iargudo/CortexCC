import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { useBellNotificationsStore } from "@/stores/bellNotificationsStore";
import { getSocket, disconnectSocket } from "@/lib/socket";

function playNotificationSound() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    /* ignore */
  }
}

export function useRealtimeNotifications(enabled: boolean = true) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrated = useAuthStore((s) => s.hydrated);
  const activeRef = useRef(false);

  const showBrowserNotification = useCallback((title: string, body: string) => {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon-48x48.png" });
    } else if (Notification.permission !== "denied") {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const ok = enabled && hydrated && isAuthenticated;
    if (!ok) {
      if (activeRef.current) {
        disconnectSocket();
        activeRef.current = false;
      }
      return;
    }

    const socket = getSocket();
    if (!socket) return;
    activeRef.current = true;

    const onAssigned = (payload: {
      conversationId?: string;
      contact_name?: string;
      channel?: string;
      queue?: string;
    }) => {
      const name = payload.contact_name ?? "Contacto";
      toast("Conversación asignada", {
        description: `${name}${payload.channel ? ` · ${payload.channel}` : ""}${payload.queue ? ` · ${payload.queue}` : ""}`,
        duration: 6000,
        action: payload.conversationId
          ? {
              label: "Abrir",
              onClick: () =>
                navigate(`/?conversation=${encodeURIComponent(payload.conversationId!)}`),
            }
          : undefined,
      });
      playNotificationSound();
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      if (payload.conversationId) {
        void qc.invalidateQueries({ queryKey: ["conversation", payload.conversationId] });
      }
      showBrowserNotification("Nueva asignación", name);
      /* La campana se alimenta desde notification:new para no duplicar si el servidor envía ambos eventos. */
    };

    const onNotification = (payload: {
      type?: string;
      conversation_id?: string;
      data?: { contact_name?: string; channel?: string; queue?: string; from_agent?: string };
    }) => {
      if (payload.type === "NEW_ASSIGNMENT" || payload.type === "TRANSFER_RECEIVED") {
        const d = payload.data ?? {};
        const title =
          payload.type === "TRANSFER_RECEIVED" ? "Transferencia recibida" : "Nueva conversación";
        const desc =
          d.contact_name ??
          (payload.type === "TRANSFER_RECEIVED" && d.from_agent
            ? `Desde ${d.from_agent}`
            : "Revisa tu bandeja");
        toast(title, {
          description: desc,
          action: payload.conversation_id
            ? {
                label: "Abrir",
                onClick: () =>
                  navigate(`/?conversation=${encodeURIComponent(payload.conversation_id!)}`),
              }
            : undefined,
        });
        playNotificationSound();
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        useBellNotificationsStore.getState().add({
          title,
          message: desc,
          conversationId: payload.conversation_id,
        });
      }
    };

    const onMessageNew = (payload: { conversationId?: string }) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      if (payload.conversationId) {
        void qc.invalidateQueries({ queryKey: ["conversation", payload.conversationId] });
      }
    };

    const onDelivery = (payload: { conversationId?: string }) => {
      if (payload.conversationId) {
        void qc.invalidateQueries({ queryKey: ["conversation", payload.conversationId] });
      }
    };

    socket.on("conversation:assigned", onAssigned);
    socket.on("notification:new", onNotification);
    socket.on("message:new", onMessageNew);
    socket.on("message:delivery_update", onDelivery);

    return () => {
      socket.off("conversation:assigned", onAssigned);
      socket.off("notification:new", onNotification);
      socket.off("message:new", onMessageNew);
      socket.off("message:delivery_update", onDelivery);
    };
  }, [enabled, hydrated, isAuthenticated, navigate, qc, showBrowserNotification]);
}
