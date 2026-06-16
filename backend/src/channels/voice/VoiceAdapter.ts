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
      const authHeader = { Authorization: `Basic ${toBasicAuth(cfg.ariUsername, cfg.ariPassword)}` };
      const response = await fetch(`${base}/ari/asterisk/info`, { headers: authHeader });
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          detail: `Credenciales ARI rechazadas (HTTP ${response.status}). Revisa usuario/contraseña en ari.conf.`,
        };
      }
      if (!response.ok) {
        return { ok: false, detail: `ARI no respondió correctamente: HTTP ${response.status}` };
      }

      const info = (await response.json()) as { system?: { version?: string } };
      const version = info.system?.version?.trim() || "desconocida";
      const warnings: string[] = [];

      const appResponse = await fetch(`${base}/ari/applications/${encodeURIComponent(cfg.ariApp)}`, {
        headers: authHeader,
      });
      if (appResponse.status === 404) {
        warnings.push(
          `La app Stasis "${cfg.ariApp}" no está suscrita. Las credenciales ARI son válidas, pero CortexCC debe estar corriendo para recibir llamadas.`
        );
      } else if (!appResponse.ok) {
        warnings.push(`No se pudo verificar la app Stasis "${cfg.ariApp}" (HTTP ${appResponse.status}).`);
      }

      return {
        ok: true,
        detail: `Asterisk ARI accesible (versión ${version}, app ${cfg.ariApp})`,
        warnings: warnings.length ? warnings : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "ARI health check failed";
      if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
        return {
          ok: false,
          detail: `No se pudo conectar a ${cfg.ariBaseUrl}. Verifica URL, puerto ARI y que Asterisk esté levantado.`,
        };
      }
      return { ok: false, detail: message };
    }
  }

  async destroy(): Promise<void> {
    // noop
  }
}
