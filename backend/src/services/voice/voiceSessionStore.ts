import { getRedis } from "../../lib/redis.js";
import { getCurrentTenantKey } from "../../lib/tenantContext.js";

export type VoiceSessionState = {
  channelId: string;
  conversationId?: string;
  voiceCallId?: string;
  channelConfigId?: string;
  assignmentId?: string;
  agentUserId?: string;
  agentChannelId?: string;
  trunkChannelId?: string;
  bridgeId?: string;
  direction: "inbound" | "outbound";
  state: "ringing" | "queued" | "ringing_agent" | "active" | "hold" | "ended";
  callerNumber?: string;
  dialedNumber?: string;
  campaignId?: string;
  dialerContactId?: string;
  recordingName?: string;
  updatedAt: string;
};

const PREFIX = "voice:session:";
const TTL_SEC = 86_400;

function key(channelId: string): string {
  const tenantKey = getCurrentTenantKey();
  return `${PREFIX}${tenantKey}:${channelId}`;
}

export async function getVoiceSession(channelId: string): Promise<VoiceSessionState | null> {
  const raw = await getRedis().get(key(channelId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VoiceSessionState;
  } catch {
    return null;
  }
}

export async function saveVoiceSession(session: VoiceSessionState): Promise<void> {
  session.updatedAt = new Date().toISOString();
  await getRedis().set(key(session.channelId), JSON.stringify(session), "EX", TTL_SEC);
}

export async function deleteVoiceSession(channelId: string): Promise<void> {
  await getRedis().del(key(channelId));
}

export async function updateVoiceSession(
  channelId: string,
  patch: Partial<VoiceSessionState>
): Promise<VoiceSessionState | null> {
  const current = (await getVoiceSession(channelId)) ?? {
    channelId,
    direction: "inbound" as const,
    state: "ringing" as const,
    updatedAt: new Date().toISOString(),
  };
  const next = { ...current, ...patch, channelId, updatedAt: new Date().toISOString() };
  await saveVoiceSession(next);
  return next;
}
