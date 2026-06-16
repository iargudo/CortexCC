import type { ChannelType } from "@/data/mock";

export type ContactActivityEvent = {
  id: string;
  kind: "touchpoint" | "call";
  occurred_at: string;
  channel_type: ChannelType;
  status: string;
  summary: string;
  outcome_label: string | null;
  conversation_id: string | null;
};

export type ContactActivityFeedResponse = {
  contact_ids: string[];
  merged_contact_count: number;
  summary: {
    total_touchpoints: number;
    touchpoints_last_30_days: number;
    open_count: number;
    last_touch_at: string | null;
    last_touch_channel: ChannelType | null;
  };
  events: ContactActivityEvent[];
};

export function formatActivityWhen(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ayer";
  if (diffD < 7) return `hace ${diffD}d`;
  if (diffD < 30) return `hace ${Math.floor(diffD / 7)}sem`;
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}

const CHANNEL_SHORT: Record<ChannelType, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  TEAMS: "Teams",
  VOICE: "Voz",
  WEBCHAT: "Web",
};

export function channelShortLabel(channel: ChannelType | null | undefined): string {
  if (!channel) return "Canal";
  return CHANNEL_SHORT[channel] ?? channel;
}

export function buildRadarHeadline(summary: ContactActivityFeedResponse["summary"]): string {
  if (summary.total_touchpoints === 0) {
    return "Sin casos anteriores · el hilo actual está en el chat";
  }

  const parts: string[] = [];
  parts.push(
    summary.touchpoints_last_30_days === summary.total_touchpoints
      ? `${summary.total_touchpoints} caso${summary.total_touchpoints === 1 ? "" : "s"} anterior${summary.total_touchpoints === 1 ? "" : "es"}`
      : `${summary.touchpoints_last_30_days} casos en 30 días (${summary.total_touchpoints} anteriores)`
  );

  if (summary.open_count > 0) {
    parts.push(`${summary.open_count} abierto${summary.open_count === 1 ? "" : "s"}`);
  }

  if (summary.last_touch_at && summary.last_touch_channel) {
    parts.push(`último: ${channelShortLabel(summary.last_touch_channel)} ${formatActivityWhen(summary.last_touch_at)}`);
  }

  return parts.join(" · ");
}
