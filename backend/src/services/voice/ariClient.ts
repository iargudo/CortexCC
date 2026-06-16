import type { VoiceChannelConfig } from "../../channels/voice/config.js";
import crypto from "node:crypto";

export class AriClient {
  constructor(private cfg: VoiceChannelConfig) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.cfg.ariUsername}:${this.cfg.ariPassword}`).toString("base64")}`;
  }

  private httpBase(): string {
    const raw = this.cfg.ariBaseUrl.replace(/\/+$/, "");
    if (raw.startsWith("https://")) return raw;
    if (raw.startsWith("http://")) return raw;
    if (raw.startsWith("wss://")) return `https://${raw.slice("wss://".length)}`;
    if (raw.startsWith("ws://")) return `http://${raw.slice("ws://".length)}`;
    return raw;
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.httpBase()}/ari${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this.authHeader(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ARI ${method} ${path} failed: HTTP ${response.status} ${text}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async answerChannel(channelId: string): Promise<void> {
    await this.request("POST", `/channels/${encodeURIComponent(channelId)}/answer`);
  }

  async hangupChannel(channelId: string): Promise<void> {
    await this.request("DELETE", `/channels/${encodeURIComponent(channelId)}`);
  }

  async createBridge(type: "mixing" | "holding" = "mixing"): Promise<{ id: string }> {
    return this.request("POST", "/bridges", { type });
  }

  async addChannelToBridge(bridgeId: string, channelId: string): Promise<void> {
    await this.request("POST", `/bridges/${encodeURIComponent(bridgeId)}/addChannel`, {
      channel: channelId,
    });
  }

  async startMoh(channelId: string, mohClass?: string): Promise<void> {
    await this.request(
      "POST",
      `/channels/${encodeURIComponent(channelId)}/moh${mohClass ? `?mohClass=${encodeURIComponent(mohClass)}` : ""}`
    );
  }

  async stopMoh(channelId: string): Promise<void> {
    await this.request("DELETE", `/channels/${encodeURIComponent(channelId)}/moh`);
  }

  async originate(params: {
    endpoint: string;
    app: string;
    appArgs?: string;
    callerId?: string;
    timeout?: number;
    channelId?: string;
    variables?: Record<string, string>;
  }): Promise<{ id: string }> {
    const query = new URLSearchParams({
      endpoint: params.endpoint,
      app: params.app,
      timeout: String(params.timeout ?? 30),
      channelId: params.channelId ?? crypto.randomUUID(),
    });
    if (params.appArgs) query.set("appArgs", params.appArgs);
    if (params.callerId) query.set("callerId", params.callerId);
    if (params.variables) {
      for (const [key, value] of Object.entries(params.variables)) {
        query.set(`variables[${key}]`, value);
      }
    }
    return this.request("POST", `/channels/originate?${query.toString()}`);
  }

  async recordChannel(channelId: string, name: string): Promise<void> {
    await this.request("POST", `/channels/${encodeURIComponent(channelId)}/record`, {
      name,
      format: "wav",
      maxDurationSeconds: 7200,
      ifExists: "overwrite",
    });
  }
}

export function createAriClient(cfg: VoiceChannelConfig): AriClient {
  return new AriClient(cfg);
}
