import type { AriTestResult, VoiceForm } from "@/lib/voiceChannelConfig";
import { parseVoiceForm } from "@/lib/voiceChannelConfig";

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
  validation: {
    ok: boolean;
    warnings: string[];
    errors: string[];
  };
};

export type TelephonyForm = {
  pbxHost: string;
  pbxWssPort: string;
  pbxAriPort: string;
  displayName: string;
  stunServers: string;
  iceGatheringTimeout: string;
  extensionRangeStart: string;
  extensionRangeEnd: string;
  voice: VoiceForm;
};

export function defaultTelephonyForm(): TelephonyForm {
  return {
    pbxHost: "",
    pbxWssPort: "8089",
    pbxAriPort: "8074",
    displayName: "",
    stunServers: "stun:stun.l.google.com:19302",
    iceGatheringTimeout: "5000",
    extensionRangeStart: "7001",
    extensionRangeEnd: "7099",
    voice: parseVoiceForm({}),
  };
}

export function parseTelephonyForm(data: TelephonySettingsView): TelephonyForm {
  return {
    pbxHost: data.pbxHost,
    pbxWssPort: String(data.pbxWssPort || 8089),
    pbxAriPort: String(data.pbxAriPort || 8074),
    displayName: data.softphone.displayName,
    stunServers: (data.softphone.stunServers ?? []).join("\n"),
    iceGatheringTimeout: String(data.softphone.iceGatheringTimeout || 5000),
    extensionRangeStart: String(data.softphone.extensionRangeStart || 7001),
    extensionRangeEnd: String(data.softphone.extensionRangeEnd || 7099),
    voice: parseVoiceForm(data.voiceChannel.config),
  };
}

export function buildTelephonyPayload(form: TelephonyForm) {
  const stunServers = form.stunServers
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    pbxHost: form.pbxHost.trim(),
    pbxWssPort: Number(form.pbxWssPort || "8089"),
    pbxAriPort: Number(form.pbxAriPort || "8074"),
    softphone: {
      displayName: form.displayName.trim(),
      stunServers: stunServers.length > 0 ? stunServers : ["stun:stun.l.google.com:19302"],
      iceGatheringTimeout: Number(form.iceGatheringTimeout || "5000"),
      extensionRangeStart: Number(form.extensionRangeStart || "7001"),
      extensionRangeEnd: Number(form.extensionRangeEnd || "7099"),
    },
    voice: {
      ariApp: form.voice.ariApp.trim(),
      ariUsername: form.voice.ariUsername.trim(),
      ariPassword: form.voice.ariPassword,
      extensionField: form.voice.extensionField.trim(),
      callerIdField: form.voice.callerIdField.trim(),
      dialedNumberField: form.voice.dialedNumberField.trim(),
      pollFallbackSec: Number(form.voice.pollFallbackSec || "15"),
      outboundTrunkEndpoint: form.voice.outboundTrunkEndpoint.trim(),
      outboundContext: form.voice.outboundContext.trim(),
      defaultCallerId: form.voice.defaultCallerId.trim() || undefined,
      agentEndpointTemplate: form.voice.agentEndpointTemplate.trim(),
      ringTimeoutSec: Number(form.voice.ringTimeoutSec || "30"),
      mohClass: form.voice.mohClass.trim(),
      recordingEnabled: form.voice.recordingEnabled,
    },
  };
}

export type { AriTestResult };
