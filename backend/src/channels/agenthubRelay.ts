import type { SendResult } from "./ChannelAdapter.js";

/**
 * Relay configuration to deliver a human agent's reply back to the customer
 * THROUGH AgentHub (single channel/number and unified history), instead of
 * sending directly via the channel provider.
 *
 * Stored per-channel in `channel.config.agenthub`:
 *   { "agenthub": { "baseUrl": "https://agenthub...", "apiPrefix": "/api/v1", "apiKey": "..." } }
 *
 * When absent, channels keep their current behavior (send via their own provider).
 */
export interface AgentHubRelayConfig {
  baseUrl: string;
  apiPrefix: string;
  apiKey: string;
}

export function getAgentHubRelayConfig(channelConfig: unknown): AgentHubRelayConfig | null {
  const cfg = (channelConfig ?? {}) as Record<string, unknown>;
  const ah = cfg.agenthub;
  if (!ah || typeof ah !== "object") return null;
  const rec = ah as Record<string, unknown>;
  const baseUrl = typeof rec.baseUrl === "string" ? rec.baseUrl.trim() : "";
  const apiKey = typeof rec.apiKey === "string" ? rec.apiKey.trim() : "";
  if (!baseUrl || !apiKey) return null;
  const apiPrefix =
    typeof rec.apiPrefix === "string" && rec.apiPrefix.trim() ? rec.apiPrefix.trim() : "/api/v1";
  return { baseUrl, apiPrefix, apiKey };
}

/**
 * POST the agent reply to AgentHub's /integrations/agent/reply. Returns a SendResult
 * so the outbound pipeline can mark the message delivered/failed. On any non-2xx it
 * returns ok:false with the AgentHub error text (e.g. widget disconnected, 24h window)
 * so the failure is visible to the agent — no silent fallback.
 */
export async function sendAgentReplyToAgentHub(params: {
  config: AgentHubRelayConfig;
  conversationRefId: string;
  channelType: "webchat" | "whatsapp";
  userId: string;
  content: string;
  media?: { mediaUrl: string; mediaType?: "image" | "video" | "document" };
}): Promise<SendResult> {
  const { config } = params;
  const prefix = config.apiPrefix.startsWith("/") ? config.apiPrefix : `/${config.apiPrefix}`;
  const url = `${config.baseUrl.replace(/\/+$/, "")}${prefix}/integrations/agent/reply`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey },
      body: JSON.stringify({
        conversationRefId: params.conversationRefId,
        channelType: params.channelType,
        userId: params.userId,
        content: params.content,
        ...(params.media ? { media: params.media } : {}),
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: `AgentHub agent/reply request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore body read errors */
    }
    return {
      ok: false,
      error: `AgentHub agent/reply ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    };
  }

  let json: unknown = {};
  try {
    json = await res.json();
  } catch {
    /* body may be empty */
  }
  const data = (json as { data?: { outboundTrackingId?: unknown } })?.data;
  const trackingId = data?.outboundTrackingId;
  return { ok: true, external_id: typeof trackingId === "string" ? trackingId : undefined };
}
