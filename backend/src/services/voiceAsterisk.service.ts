import type { Channel } from "@prisma/client";
import WebSocket from "ws";
import type { Server } from "socket.io";
import { getPrisma } from "../lib/prisma.js";
import { ensureConnection, listActiveTenants } from "../lib/tenantConnectionManager.js";
import { runWithTenant } from "../lib/tenantContext.js";
import { parseVoiceChannelConfig, type VoiceChannelConfig } from "../channels/voice/config.js";
import { handleStasisEnd, handleStasisStart } from "./voice/voiceCallController.service.js";

type AriaAny = Record<string, unknown>;

type ChannelRunner = {
  channelId: string;
  close: () => void;
};

let runners: ChannelRunner[] = [];
let started = false;

function toWsUrl(cfg: VoiceChannelConfig): string {
  const rawBase = cfg.ariBaseUrl.replace(/\/+$/, "");
  const base =
    rawBase.startsWith("https://")
      ? `wss://${rawBase.slice("https://".length)}`
      : rawBase.startsWith("http://")
        ? `ws://${rawBase.slice("http://".length)}`
        : rawBase;
  const url = new URL(`${base}/ari/events`);
  url.searchParams.set("app", cfg.ariApp);
  url.searchParams.set("api_key", `${cfg.ariUsername}:${cfg.ariPassword}`);
  return url.toString();
}

async function processAriEvent(io: Server | null, channel: Channel, cfg: VoiceChannelConfig, payload: AriaAny): Promise<void> {
  const eventType = String(payload.type ?? "");
  if (!eventType) return;

  if (eventType === "StasisStart") {
    await handleStasisStart(io, channel, cfg, payload);
    return;
  }

  if (eventType === "StasisEnd" || eventType === "ChannelDestroyed" || eventType === "ChannelHangupRequest") {
    await handleStasisEnd(io, channel, payload);
  }
}

function startChannelRunner(channel: Channel, io: Server | null): ChannelRunner | null {
  let cfg: VoiceChannelConfig;
  try {
    cfg = parseVoiceChannelConfig(channel.config);
  } catch (err) {
    console.error(`[voice] Invalid VOICE channel config (${channel.name}):`, err);
    return null;
  }

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;
    const wsUrl = toWsUrl(cfg);
    ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log(`[voice] ARI connected for channel ${channel.name} app=${cfg.ariApp}`);
    });

    ws.on("message", (raw) => {
      const text = raw.toString("utf8");
      let payload: AriaAny;
      try {
        payload = JSON.parse(text) as AriaAny;
      } catch {
        return;
      }
      void processAriEvent(io, channel, cfg, payload).catch((err) => {
        console.error(`[voice] Failed to process ARI event (${channel.name}):`, err);
      });
    });

    ws.on("error", (err) => {
      console.error(`[voice] ARI socket error (${channel.name}):`, err);
    });

    ws.on("close", () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, Math.max(cfg.pollFallbackSec, 5) * 1000);
      console.warn(`[voice] ARI disconnected (${channel.name}), retry scheduled`);
    });
  };

  connect();

  return {
    channelId: channel.id,
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    },
  };
}

export async function startVoiceAsteriskListeners(io: Server | null): Promise<void> {
  if (started) return;
  started = true;

  const tenants = await listActiveTenants();
  if (tenants.length === 0) {
    console.log("[voice] No active tenants found");
    return;
  }

  for (const tenant of tenants) {
    await runWithTenant(tenant.tenant_key, tenant.display_name, async () => {
      await ensureConnection(tenant.tenant_key);
      const channels = await getPrisma().channel.findMany({
        where: { type: "VOICE", status: "active" },
      });
      for (const ch of channels) {
        const runner = startChannelRunner(ch, io);
        if (runner) runners.push(runner);
      }
    });
  }

  console.log(`[voice] Voice listeners started (${runners.length} channels)`);
}

export async function reloadVoiceAsteriskListeners(io: Server | null): Promise<void> {
  for (const runner of runners) {
    runner.close();
  }
  runners = [];
  started = false;
  await startVoiceAsteriskListeners(io);
}

export async function stopVoiceAsteriskListeners(): Promise<void> {
  for (const runner of runners) {
    runner.close();
  }
  runners = [];
  started = false;
}
