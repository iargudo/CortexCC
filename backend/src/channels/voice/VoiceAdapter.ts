import type { Channel } from "@prisma/client";
import type {
  ChannelAdapter,
  ConversationWithChannel,
  HealthStatus,
  IncomingMessage,
  OutboundMessage,
  SendResult,
} from "../ChannelAdapter.js";
import { parseVoiceChannelConfig, type VoiceChannelConfig } from "./config.js";

function toBasicAuth(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`).toString("base64");
}

function toHttpBaseUrl(ariBaseUrl: string): string {
  if (ariBaseUrl.startsWith("https://")) return ariBaseUrl;
  if (ariBaseUrl.startsWith("http://")) return ariBaseUrl;
  if (ariBaseUrl.startsWith("wss://")) return `https://${ariBaseUrl.slice("wss://".length)}`;
  if (ariBaseUrl.startsWith("ws://")) return `http://${ariBaseUrl.slice("ws://".length)}`;
  return ariBaseUrl;
}

export class VoiceAdapter implements ChannelAdapter {
  readonly type = "VOICE" as const;

  async initialize(channel: Channel): Promise<void> {
    parseVoiceChannelConfig(channel.config);
  }

  async sendMessage(_conversation: ConversationWithChannel, _message: OutboundMessage): Promise<SendResult> {
    return { ok: false, error: "VOICE adapter does not support text outbound" };
  }

  async parseIncoming(_raw: unknown): Promise<IncomingMessage> {
    throw new Error("VOICE adapter parsing is handled by ARI event listener");
  }

  async healthCheck(channel: Channel): Promise<HealthStatus> {
    let cfg: VoiceChannelConfig;
    try {
      cfg = parseVoiceChannelConfig(channel.config);
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Invalid voice config" };
    }

    try {
      const base = toHttpBaseUrl(cfg.ariBaseUrl).replace(/\/+$/, "");
      const response = await fetch(`${base}/ari/asterisk/info`, {
        headers: {
          Authorization: `Basic ${toBasicAuth(cfg.ariUsername, cfg.ariPassword)}`,
        },
      });
      if (!response.ok) {
        return { ok: false, detail: `ARI health check failed: HTTP ${response.status}` };
      }
      return { ok: true, detail: "Asterisk ARI reachable" };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "ARI health check failed",
      };
    }
  }

  async destroy(): Promise<void> {
    // noop
  }
}
