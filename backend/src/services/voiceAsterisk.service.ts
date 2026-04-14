import type { Channel } from "@prisma/client";
import WebSocket from "ws";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { ingestVoiceCallEvent } from "./voiceInbound.service.js";
import { parseVoiceChannelConfig, type VoiceChannelConfig } from "../channels/voice/config.js";

type AriaAny = Record<string, unknown>;

type ChannelRunner = {
  channelId: string;
  close: () => void;
};

let runners: ChannelRunner[] = [];
let started = false;

function readPath(input: AriaAny | undefined, path: string): string | undefined {
  if (!input) return undefined;
  const segments = path.split(".");
  let current: unknown = input;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current === "string") return current;
  if (typeof current === "number") return String(current);
  return undefined;
}

function toWsUrl(cfg: VoiceChannelConfig): string {
  const base = cfg.ariBaseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/ari/events`);
  url.searchParams.set("app", cfg.ariApp);
  url.searchParams.set("api_key", `${cfg.ariUsername}:${cfg.ariPassword}`);
  return url.toString();
}

function inferCallState(eventType: string, payload: AriaAny): "ringing" | "active" | "hold" | "ended" | "unknown" {
  if (eventType === "StasisStart") return "ringing";
  if (eventType === "StasisEnd" || eventType === "ChannelDestroyed" || eventType === "ChannelHangupRequest") return "ended";
  if (eventType === "ChannelStateChange") {
    const state = String(readPath(payload, "channel.state") ?? "").toLowerCase();
    if (state.includes("ring")) return "ringing";
    if (state.includes("up")) return "active";
    if (state.includes("hold")) return "hold";
  }
  return "unknown";
}

function inferDirection(payload: AriaAny): "inbound" | "outbound" {
  const name = String(readPath(payload, "channel.name") ?? "").toLowerCase();
  if (name.includes("dial") || name.includes("local/")) return "outbound";
  return "inbound";
}

function extractCallId(payload: AriaAny): string | undefined {
  return (
    readPath(payload, "channel.id") ??
    readPath(payload, "replace_channel.id") ??
    readPath(payload, "bridge.id") ??
    undefined
  );
}

async function processAriEvent(io: Server | null, channel: Channel, cfg: VoiceChannelConfig, payload: AriaAny): Promise<void> {
  const eventType = String(payload.type ?? "");
  if (!eventType) return;
  const state = inferCallState(eventType, payload);
  if (state === "unknown") return;

  const externalCallId = extractCallId(payload);
  if (!externalCallId) return;

  const callerNumber = readPath(payload, cfg.callerIdField) ?? readPath(payload, "channel.caller.number");
  const dialedNumber = readPath(payload, cfg.dialedNumberField) ?? readPath(payload, "channel.dialplan.exten");
  const callerName = readPath(payload, "channel.caller.name");
  const timestampRaw = String(payload.timestamp ?? "");
  const timestamp = timestampRaw ? new Date(timestampRaw) : new Date();

  await ingestVoiceCallEvent(
    {
      channelId: channel.id,
      externalCallId,
      callerNumber,
      dialedNumber,
      callerName,
      direction: inferDirection(payload),
      state,
      timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
      raw: payload,
    },
    io
  );
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
      console.log(`[voice] ARI connected for channel ${channel.name}`);
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

  const channels = await prisma.channel.findMany({
    where: { type: "VOICE", status: "active" },
  });
  if (channels.length === 0) {
    console.log("[voice] No active VOICE channels found");
    return;
  }

  runners = channels
    .map((channel) => startChannelRunner(channel, io))
    .filter((runner): runner is ChannelRunner => Boolean(runner));

  console.log(`[voice] Voice listeners started (${runners.length} channels)`);
}

export async function stopVoiceAsteriskListeners(): Promise<void> {
  for (const runner of runners) {
    runner.close();
  }
  runners = [];
  started = false;
}
