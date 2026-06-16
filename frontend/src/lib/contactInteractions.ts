import type { ChannelType } from "@/data/mock";

export type ContactInteractionKind = "conversation" | "voice_call";

export type ContactInteractionMessage = {
  content: string;
  created_at: string;
  sender_type: string;
  content_type: string;
};

export type ContactInteraction = {
  id: string;
  kind: ContactInteractionKind;
  occurred_at: string;
  channel_type: ChannelType | null;
  status: string;
  preview: string | null;
  conversation_id: string | null;
  subject: string | null;
  duration_seconds: number | null;
  direction: string | null;
  queue_name: string | null;
  csat_score: number | null;
  handle_time_seconds: number | null;
  message_count: number | null;
  recent_messages: ContactInteractionMessage[] | null;
};

export type ContactInteractionsResponse = {
  contact_ids: string[];
  merged_contact_count: number;
  items: ContactInteraction[];
  stats: {
    total_interactions: number;
    active_count: number;
    avg_csat: number | null;
    avg_handle_time_minutes: number | null;
  };
};

const ONGOING_STATUSES = new Set(["WAITING", "ASSIGNED", "ACTIVE", "ON_HOLD"]);

export function isActiveInteraction(status: string): boolean {
  return ONGOING_STATUSES.has(status);
}

export function formatInteractionWhen(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `hace ${diffD}d`;
  return date.toLocaleDateString("es", { day: "numeric", month: "short", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const CONTENT_TYPE_LABEL: Record<string, string> = {
  IMAGE: "[Imagen]",
  FILE: "[Archivo]",
  AUDIO: "[Audio]",
  VIDEO: "[Video]",
  EMAIL: "[Correo]",
  VOICE_CALL: "[Llamada]",
  CSAT_REQUEST: "[Encuesta CSAT]",
};

export function formatMessageSnippet(content: string, contentType: string): string {
  const label = CONTENT_TYPE_LABEL[contentType];
  if (label) return label;
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (!trimmed) return "—";
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}

export function senderLabel(senderType: string): string {
  if (senderType === "CONTACT") return "Cliente";
  if (senderType === "AGENT") return "Agente";
  if (senderType === "BOT") return "Bot";
  return "Sistema";
}
