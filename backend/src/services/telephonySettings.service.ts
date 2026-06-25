import type { Channel, OrganizationSettings } from "@prisma/client";
import { parseVoiceChannelConfig, type VoiceChannelConfig } from "../channels/voice/config.js";
import { getPrisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import {
  DEFAULT_PBX_ARI_PORT,
  DEFAULT_PBX_WSS_PORT,
  derivePbxUrls,
  extractPortFromAriUrl,
  extractPortFromSipServer,
  resolvePbxHost,
  validateTelephonyConsistency,
  type TelephonyValidation,
} from "../lib/pbxHost.js";

export type TelephonySettingsView = {
  pbxHost: string;
  pbxWssPort: number;
  pbxAriPort: number;
  derived: {
    sipServer: string;
    sipRealm: string;
    ariBaseUrl: string;
  };
  softphone: {
    displayName: string;
    stunServers: string[];
    turnServers: string[];
    iceGatheringTimeout: number;
    extensionRangeStart: number;
    extensionRangeEnd: number;
  };
  voiceChannel: {
    id: string | null;
    name: string | null;
    status: string | null;
    config: Record<string, unknown>;
  };
  validation: TelephonyValidation;
};

export type SaveTelephonyInput = {
  pbxHost: string;
  pbxWssPort?: number;
  pbxAriPort?: number;
  softphone?: {
    displayName?: string;
    stunServers?: string[];
    turnServers?: string[];
    iceGatheringTimeout?: number;
    extensionRangeStart?: number;
    extensionRangeEnd?: number;
  };
  voice?: Record<string, unknown>;
};

function clampPort(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}

async function findVoiceChannel(): Promise<Channel | null> {
  return getPrisma().channel.findFirst({ where: { type: "VOICE" }, orderBy: { created_at: "asc" } });
}

function voiceConfigRecord(channel: Channel | null): Record<string, unknown> {
  return (channel?.config ?? {}) as Record<string, unknown>;
}

function buildView(org: OrganizationSettings | null, voiceChannel: Channel | null): TelephonySettingsView {
  const voiceCfg = voiceConfigRecord(voiceChannel);
  const ariBaseUrl = String(voiceCfg.ariBaseUrl ?? "");

  const pbxHost =
    resolvePbxHost({
      pbxHost: org?.pbx_host,
      sipServer: org?.sip_server,
      ariBaseUrl,
    }) ?? "";

  const pbxWssPort = org?.pbx_wss_port ?? extractPortFromSipServer(org?.sip_server, DEFAULT_PBX_WSS_PORT);
  const pbxAriPort = org?.pbx_ari_port ?? extractPortFromAriUrl(ariBaseUrl, DEFAULT_PBX_ARI_PORT);

  const derived = pbxHost
    ? derivePbxUrls(pbxHost, pbxWssPort, pbxAriPort)
    : {
        host: "",
        wssPort: pbxWssPort,
        ariPort: pbxAriPort,
        sipServer: org?.sip_server ?? "",
        sipRealm: org?.sip_realm ?? "",
        ariBaseUrl,
      };

  const validation = validateTelephonyConsistency({
    pbxHost: pbxHost || null,
    sipServer: org?.sip_server,
    sipRealm: org?.sip_realm,
    ariBaseUrl: derived.ariBaseUrl || ariBaseUrl,
    voiceChannelExists: Boolean(voiceChannel),
    voiceChannelStatus: voiceChannel?.status ?? null,
  });

  return {
    pbxHost,
    pbxWssPort,
    pbxAriPort,
    derived: {
      sipServer: derived.sipServer,
      sipRealm: derived.sipRealm,
      ariBaseUrl: derived.ariBaseUrl || ariBaseUrl,
    },
    softphone: {
      displayName: org?.sip_display_name ?? "",
      stunServers: org?.sip_stun_servers ?? ["stun:stun.l.google.com:19302"],
      turnServers: org?.sip_turn_servers ?? [],
      iceGatheringTimeout: org?.sip_ice_gathering_timeout ?? 5000,
      extensionRangeStart: org?.sip_extension_range_start ?? 7001,
      extensionRangeEnd: org?.sip_extension_range_end ?? 7099,
    },
    voiceChannel: {
      id: voiceChannel?.id ?? null,
      name: voiceChannel?.name ?? null,
      status: voiceChannel?.status ?? null,
      config: voiceCfg,
    },
    validation,
  };
}

export async function getTelephonySettings(): Promise<TelephonySettingsView> {
  const org = await getPrisma().organizationSettings.findUnique({ where: { id: "default" } });
  const voiceChannel = await findVoiceChannel();
  return buildView(org, voiceChannel);
}

export async function saveTelephonySettings(input: SaveTelephonyInput): Promise<TelephonySettingsView> {
  const host = input.pbxHost?.trim();
  if (!host) throw new HttpError(400, "pbxHost es requerido");

  const wssPort = clampPort(input.pbxWssPort, DEFAULT_PBX_WSS_PORT);
  const ariPort = clampPort(input.pbxAriPort, DEFAULT_PBX_ARI_PORT);
  const derived = derivePbxUrls(host, wssPort, ariPort);

  const soft = input.softphone ?? {};
  const rangeStart = clampPort(soft.extensionRangeStart, 7001);
  const rangeEnd = clampPort(soft.extensionRangeEnd, 7099);
  if (rangeStart > rangeEnd) {
    throw new HttpError(400, "extensionRangeStart no puede ser mayor que extensionRangeEnd");
  }

  const stunServers =
    Array.isArray(soft.stunServers) && soft.stunServers.length > 0
      ? soft.stunServers.map((s) => String(s).trim()).filter(Boolean)
      : ["stun:stun.l.google.com:19302"];
  const turnServers = Array.isArray(soft.turnServers)
    ? soft.turnServers.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const iceGatheringTimeout =
    typeof soft.iceGatheringTimeout === "number" && Number.isFinite(soft.iceGatheringTimeout)
      ? Math.max(1000, Math.min(30000, Math.round(soft.iceGatheringTimeout)))
      : 5000;

  await getPrisma().organizationSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      pbx_host: derived.host,
      pbx_wss_port: wssPort,
      pbx_ari_port: ariPort,
      sip_server: derived.sipServer,
      sip_realm: derived.sipRealm,
      sip_display_name: String(soft.displayName ?? "").trim() || null,
      sip_stun_servers: stunServers,
      sip_turn_servers: turnServers,
      sip_ice_gathering_timeout: iceGatheringTimeout,
      sip_extension_range_start: rangeStart,
      sip_extension_range_end: rangeEnd,
    },
    update: {
      pbx_host: derived.host,
      pbx_wss_port: wssPort,
      pbx_ari_port: ariPort,
      sip_server: derived.sipServer,
      sip_realm: derived.sipRealm,
      sip_display_name: String(soft.displayName ?? "").trim() || null,
      sip_stun_servers: stunServers,
      sip_turn_servers: turnServers,
      sip_ice_gathering_timeout: iceGatheringTimeout,
      sip_extension_range_start: rangeStart,
      sip_extension_range_end: rangeEnd,
    },
  });

  const voiceChannel = await findVoiceChannel();
  if (voiceChannel) {
    const currentCfg = voiceConfigRecord(voiceChannel);
    const mergedCfg = {
      ...currentCfg,
      ...(input.voice ?? {}),
      ariBaseUrl: derived.ariBaseUrl,
    };
    const parsed: VoiceChannelConfig = parseVoiceChannelConfig(mergedCfg);
    await getPrisma().channel.update({
      where: { id: voiceChannel.id },
      data: { config: parsed as object },
    });
  } else if (
    input.voice &&
    String((input.voice as Record<string, unknown>).ariUsername ?? "").trim() &&
    String((input.voice as Record<string, unknown>).ariPassword ?? "").trim()
  ) {
    // No existe canal VOICE todavía: lo creamos aquí para que toda la
    // configuración de voz viva en Telefonía. Queda inactivo hasta que el
    // admin lo active en Configuración → Canales.
    const parsed: VoiceChannelConfig = parseVoiceChannelConfig({
      ...input.voice,
      ariBaseUrl: derived.ariBaseUrl,
    });
    await getPrisma().channel.create({
      data: { name: "Voz", type: "VOICE", status: "inactive", config: parsed as object },
    });
  }

  return getTelephonySettings();
}

export async function applyPbxHostToVoiceChannelIfNeeded(
  channel: Channel,
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (channel.type !== "VOICE") return config;
  const org = await getPrisma().organizationSettings.findUnique({ where: { id: "default" } });
  const host = resolvePbxHost({
    pbxHost: org?.pbx_host,
    sipServer: org?.sip_server,
    ariBaseUrl: String(config.ariBaseUrl ?? ""),
  });
  if (!host) return config;
  const wssPort = org?.pbx_wss_port ?? DEFAULT_PBX_WSS_PORT;
  const ariPort = org?.pbx_ari_port ?? DEFAULT_PBX_ARI_PORT;
  const derived = derivePbxUrls(host, wssPort, ariPort);
  return { ...config, ariBaseUrl: derived.ariBaseUrl };
}
