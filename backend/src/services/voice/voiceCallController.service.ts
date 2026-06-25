import type { Channel, Conversation } from "@prisma/client";
import type { Server } from "socket.io";
import { getPrisma } from "../../lib/prisma.js";
import { emitTenantLiveEvent, userRoom } from "../../lib/socketRooms.js";
import { scheduleInitialSlaCheck } from "../slaCheck.service.js";
import { getCurrentTenantKey } from "../../lib/tenantContext.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { buildAgentEndpoint, parseVoiceChannelConfig, type VoiceChannelConfig } from "../../channels/voice/config.js";
import { createAriClient } from "./ariClient.js";
import { ingestVoiceCallEvent, normalizePhoneNumber } from "./voiceCall.service.js";
import {
  deleteVoiceSession,
  getVoiceSession,
  saveVoiceSession,
  updateVoiceSession,
  type VoiceSessionState,
} from "./voiceSessionStore.js";
import { enqueueRecordingUpload } from "../../queue/bull.js";

type AriaAny = Record<string, unknown>;

function readPath(input: AriaAny | undefined, path: string): string | undefined {
  if (!input) return undefined;
  let current: unknown = input;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current === "string") return current;
  if (typeof current === "number") return String(current);
  return undefined;
}

function parseStasisArgs(args: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!args?.length) return out;
  out.mode = args[0] ?? "";
  if (args[0] === "inbound") {
    out.dialedNumber = args[1] ?? "";
    out.callerNumber = args[2] ?? "";
  } else if (args[0] === "outbound") {
    out.dialedNumber = args[1] ?? "";
  } else if (args[0] === "agent") {
    out.conversationId = args[1] ?? "";
    out.agentUserId = args[2] ?? "";
  }
  return out;
}

function parseVoiceConfigOrThrow(channel: Channel): ReturnType<typeof parseVoiceChannelConfig> {
  try {
    return parseVoiceChannelConfig(channel.config);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Invalid VOICE channel config";
    throw new HttpError(400, `Canal de voz mal configurado: ${detail}`);
  }
}

async function recoverVoiceSession(
  conversation: Conversation & { channel: Channel },
  callerChannelId: string
): Promise<VoiceSessionState> {
  const voiceCall = await getPrisma().voiceCall.findFirst({
    where: {
      conversation_id: conversation.id,
      OR: [{ asterisk_channel_id: callerChannelId }, { external_call_id: callerChannelId }],
    },
    orderBy: { created_at: "desc" },
  });

  const session: VoiceSessionState = {
    channelId: callerChannelId,
    conversationId: conversation.id,
    channelConfigId: conversation.channel_id,
    direction: voiceCall?.direction === "outbound" ? "outbound" : "inbound",
    state: "queued",
    callerNumber: voiceCall?.remote_uri ?? undefined,
    updatedAt: new Date().toISOString(),
  };
  await saveVoiceSession(session);
  return session;
}

export async function ringAgentForConversation(
  io: Server | null,
  conversationId: string,
  agentUserId: string
): Promise<void> {
  const conversation = await getPrisma().conversation.findUnique({
    where: { id: conversationId },
    include: { channel: true, contact: true },
  });
  if (!conversation || conversation.channel.type !== "VOICE") {
    throw new HttpError(404, "Conversación de voz no encontrada");
  }

  const cfg = parseVoiceConfigOrThrow(conversation.channel);
  const ari = createAriClient(cfg);
  const agent = await getPrisma().user.findUnique({
    where: { id: agentUserId },
    select: { sip_extension: true },
  });
  if (!agent?.sip_extension?.trim()) {
    throw new HttpError(
      400,
      "El agente no tiene extensión SIP. Configúrala en el softphone o perfil antes de contestar."
    );
  }

  const callerChannelId = conversation.source_ref_id?.trim();
  if (!callerChannelId) {
    throw new HttpError(
      409,
      "La conversación no tiene canal Asterisk activo. Verifica que ARI recibió la llamada entrante."
    );
  }

  let voiceSession = await getVoiceSession(callerChannelId);
  if (!voiceSession) {
    voiceSession = await recoverVoiceSession(conversation, callerChannelId);
  }
  if (!voiceSession) {
    throw new HttpError(
      409,
      "Sesión de voz no encontrada. Reinicia la llamada o verifica que Asterisk y Redis estén activos."
    );
  }

  const endpoint = buildAgentEndpoint(cfg, agent.sip_extension);
  let agentLeg: { id: string };
  try {
    agentLeg = await ari.originate({
      endpoint,
      app: cfg.ariApp,
      appArgs: `agent,${conversationId},${agentUserId}`,
      timeout: cfg.ringTimeoutSec,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "ARI originate failed";
    throw new HttpError(503, detail);
  }

  await updateVoiceSession(callerChannelId, {
    agentUserId,
    agentChannelId: agentLeg.id,
    state: "ringing_agent",
    conversationId,
    callerNumber: voiceSession.callerNumber,
    dialedNumber: voiceSession.dialedNumber,
    direction: voiceSession.direction,
    channelConfigId: conversation.channel_id,
  });

  const assignment = await getPrisma().conversationAssignment.findFirst({
    where: { conversation_id: conversationId, user_id: agentUserId, ended_at: null },
    orderBy: { assigned_at: "desc" },
  });
  if (assignment) {
    await getPrisma().conversationAssignment.update({
      where: { id: assignment.id },
      data: { ring_started_at: new Date() },
    });
  }

  io?.to(userRoom(getCurrentTenantKey(), agentUserId)).emit("voice:ringing", {
    conversationId,
    callerNumber: voiceSession.callerNumber,
    direction: "inbound",
  });
}

export async function bridgeChannels(
  io: Server | null,
  cfg: VoiceChannelConfig,
  callerChannelId: string,
  agentChannelId: string,
  conversationId: string
): Promise<void> {
  const ari = createAriClient(cfg);
  await ari.stopMoh(callerChannelId).catch(() => undefined);
  await ari.answerChannel(agentChannelId).catch(() => undefined);
  const bridge = await ari.createBridge("mixing");
  await ari.addChannelToBridge(bridge.id, callerChannelId);
  await ari.addChannelToBridge(bridge.id, agentChannelId);

  let recordingName: string | undefined;
  if (cfg.recordingEnabled) {
    recordingName = `call-${conversationId}-${Date.now()}`;
    await ari.recordBridge(bridge.id, recordingName).catch((err) =>
      console.error("[voice] Failed to start bridge recording:", err)
    );
  }

  await updateVoiceSession(callerChannelId, {
    bridgeId: bridge.id,
    state: "active",
    agentChannelId,
    conversationId,
    recordingName,
  });

  await getPrisma().conversation.update({
    where: { id: conversationId },
    data: { status: "ACTIVE" },
  });

  await ingestVoiceCallEvent(
    {
      conversationId,
      externalCallId: callerChannelId,
      asteriskChannelId: callerChannelId,
      bridgeId: bridge.id,
      state: "active",
      direction: "inbound",
      timestamp: new Date(),
    },
    io
  );

  emitTenantLiveEvent(io, getCurrentTenantKey(), "voice:answered", {
    conversationId,
    bridgeId: bridge.id,
  });
}

export async function originateOutboundCall(params: {
  io: Server | null;
  channel: Channel;
  agentUserId: string;
  phone: string;
  conversationId?: string;
  contactId?: string;
  campaignId?: string;
  dialerContactId?: string;
}): Promise<{ conversationId: string; voiceCallId: string; callerChannelId: string }> {
  const cfg = parseVoiceChannelConfig(params.channel.config);
  const ari = createAriClient(cfg);
  const agent = await getPrisma().user.findUnique({
    where: { id: params.agentUserId },
    select: { sip_extension: true, first_name: true, last_name: true },
  });
  if (!agent?.sip_extension) throw new Error("Agent has no SIP extension configured");

  const normalizedPhone = normalizePhoneNumber(params.phone);
  if (!normalizedPhone) throw new Error("Invalid phone number");

  let conversationId = params.conversationId;
  if (!conversationId) {
    let contactId = params.contactId;
    if (!contactId) {
      const contact = await getPrisma().contact.findFirst({
        where: { OR: [{ phone: normalizedPhone }, { phone_wa: normalizedPhone }] },
      });
      contactId =
        contact?.id ??
        (
          await getPrisma().contact.create({
            data: { name: normalizedPhone, phone: normalizedPhone, source_system: "voice" },
          })
        ).id;
    }
    const queue = await getPrisma().queue.findFirst({ where: { is_active: true } });
    const conversation = await getPrisma().conversation.create({
      data: {
        channel_id: params.channel.id,
        contact_id: contactId,
        queue_id: queue?.id,
        status: "ASSIGNED",
        source: "voice",
        subject: normalizedPhone,
        last_message_at: new Date(),
      },
    });
    conversationId = conversation.id;
    await getPrisma().conversationAssignment.create({
      data: {
        conversation_id: conversationId,
        user_id: params.agentUserId,
        reason: params.campaignId ? "dialer" : "outbound_click",
      },
    });
    if (queue?.id) {
      await scheduleInitialSlaCheck(conversationId, queue.id);
    }
  }

  const agentEndpoint = buildAgentEndpoint(cfg, agent.sip_extension);
  const agentLeg = await ari.originate({
    endpoint: agentEndpoint,
    app: cfg.ariApp,
    appArgs: `outbound_agent,${conversationId},${params.agentUserId},${normalizedPhone}`,
    timeout: cfg.ringTimeoutSec,
  });

  const session: VoiceSessionState = {
    channelId: agentLeg.id,
    conversationId,
    channelConfigId: params.channel.id,
    agentUserId: params.agentUserId,
    agentChannelId: agentLeg.id,
    direction: "outbound",
    state: "ringing_agent",
    dialedNumber: normalizedPhone,
    campaignId: params.campaignId,
    dialerContactId: params.dialerContactId,
    updatedAt: new Date().toISOString(),
  };
  await saveVoiceSession(session);

  const out = await ingestVoiceCallEvent(
    {
      channelId: params.channel.id,
      conversationId,
      contactId: params.contactId,
      agentUserId: params.agentUserId,
      externalCallId: agentLeg.id,
      asteriskChannelId: agentLeg.id,
      dialedNumber: normalizedPhone,
      direction: "outbound",
      state: "ringing",
      metadata: {
        campaign_id: params.campaignId,
        dialer_contact_id: params.dialerContactId,
      },
    },
    params.io,
    { userId: params.agentUserId }
  );

  return {
    conversationId,
    voiceCallId: out.voiceCallId,
    callerChannelId: agentLeg.id,
  };
}

export async function originateTrunkLegForOutbound(
  io: Server | null,
  cfg: VoiceChannelConfig,
  agentChannelId: string,
  phone: string,
  conversationId: string
): Promise<void> {
  const ari = createAriClient(cfg);
  const session = await getVoiceSession(agentChannelId);
  if (!session) return;

  const trunkEndpoint = `${cfg.outboundTrunkEndpoint}/${phone}`;
  const trunkLeg = await ari.originate({
    endpoint: trunkEndpoint,
    app: cfg.ariApp,
    appArgs: `outbound_trunk,${conversationId},${agentChannelId}`,
    callerId: cfg.defaultCallerId,
    timeout: cfg.ringTimeoutSec,
  });

  await updateVoiceSession(agentChannelId, {
    trunkChannelId: trunkLeg.id,
    state: "ringing",
  });

  await ingestVoiceCallEvent(
    {
      conversationId,
      externalCallId: agentChannelId,
      asteriskChannelId: trunkLeg.id,
      dialedNumber: phone,
      direction: "outbound",
      state: "ringing",
    },
    io
  );
}

export async function handleStasisStart(
  io: Server | null,
  channel: Channel,
  cfg: VoiceChannelConfig,
  payload: AriaAny
): Promise<void> {
  const channelId = readPath(payload, "channel.id");
  if (!channelId) return;

  const args = (payload.args as string[] | undefined) ?? [];
  const parsed = parseStasisArgs(args);
  const callerNumber = readPath(payload, cfg.callerIdField) ?? readPath(payload, "channel.caller.number");
  const dialedNumber = parsed.dialedNumber || readPath(payload, cfg.dialedNumberField);

  const ari = createAriClient(cfg);

  if (parsed.mode === "inbound") {
    await ari.answerChannel(channelId);
    await ari.startMoh(channelId, cfg.mohClass).catch(() => undefined);

    const session: VoiceSessionState = {
      channelId,
      channelConfigId: channel.id,
      direction: "inbound",
      state: "queued",
      callerNumber: callerNumber ?? parsed.callerNumber,
      dialedNumber,
      updatedAt: new Date().toISOString(),
    };
    await saveVoiceSession(session);

    await ingestVoiceCallEvent(
      {
        channelId: channel.id,
        externalCallId: channelId,
        asteriskChannelId: channelId,
        callerNumber: callerNumber ?? parsed.callerNumber,
        dialedNumber,
        direction: "inbound",
        state: "ringing",
        raw: payload,
      },
      io
    );
    return;
  }

  if (parsed.mode === "agent" && parsed.conversationId && parsed.agentUserId) {
    const parent = await getPrisma().conversation.findUnique({ where: { id: parsed.conversationId } });
    const parentChannelId = parent?.source_ref_id;
    if (parentChannelId) {
      await bridgeChannels(io, cfg, parentChannelId, channelId, parsed.conversationId);
    }
    return;
  }

  if (parsed.mode === "outbound_agent" && args[1] && args[2] && args[3]) {
    const conversationId = args[1];
    const phone = args[3];
    await updateVoiceSession(channelId, {
      conversationId,
      agentUserId: args[2],
      state: "active",
      direction: "outbound",
    });
    await originateTrunkLegForOutbound(io, cfg, channelId, phone, conversationId);
    return;
  }

  if (parsed.mode === "outbound_trunk" && args[1] && args[2]) {
    const conversationId = args[1];
    const agentChannelId = args[2];
    await bridgeChannels(io, cfg, agentChannelId, channelId, conversationId);
    return;
  }

  if (parsed.mode === "predictive" && args[1] && args[2]) {
    const campaignId = args[1];
    const dialerContactId = args[2];
    const { assignPredictiveAnswerToAgent } = await import("../dialer/predictiveDialer.service.js");
    await assignPredictiveAnswerToAgent(io, campaignId, channelId, dialerContactId);
    return;
  }
}

export async function handleStasisEnd(
  io: Server | null,
  channel: Channel,
  payload: AriaAny
): Promise<void> {
  const channelId = readPath(payload, "channel.id");
  if (!channelId) return;

  const session = await getVoiceSession(channelId);
  if (!session) return;

  await ingestVoiceCallEvent(
    {
      channelId: channel.id,
      conversationId: session.conversationId,
      externalCallId: session.channelId,
      asteriskChannelId: channelId,
      bridgeId: session.bridgeId,
      callerNumber: session.callerNumber,
      dialedNumber: session.dialedNumber,
      direction: session.direction,
      state: "ended",
      timestamp: new Date(),
    },
    io
  );

  if (session.conversationId) {
    await getPrisma().conversation.update({
      where: { id: session.conversationId },
      data: { status: "WRAP_UP" },
    });
  }

  if (session.recordingName) {
    await enqueueRecordingUpload({
      recordingName: session.recordingName,
      conversationId: session.conversationId,
      channelConfigId: session.channelConfigId,
    }).catch((err) => console.error("[voice] Failed to enqueue recording upload:", err));
  }

  emitTenantLiveEvent(io, getCurrentTenantKey(), "voice:ended", {
    conversationId: session.conversationId,
    channelId,
  });
  await deleteVoiceSession(channelId);
}

export async function answerConversationCall(
  io: Server | null,
  conversationId: string,
  agentUserId: string
): Promise<void> {
  const conversation = await getPrisma().conversation.findUnique({
    where: { id: conversationId },
    include: { channel: true },
  });
  if (!conversation?.channel) {
    throw new HttpError(404, "Conversación no encontrada");
  }
  if (conversation.channel.type !== "VOICE") {
    throw new HttpError(400, "Esta conversación no es de voz");
  }

  const callerChannelId = conversation.source_ref_id?.trim();
  if (!callerChannelId) {
    throw new HttpError(
      409,
      "No hay canal de llamada activo. Si la llamada llegó al softphone, contesta desde el widget telefónico."
    );
  }

  const session = await getVoiceSession(callerChannelId);
  if (session?.state === "active" && session.bridgeId) return;

  const assignment = await getPrisma().conversationAssignment.findFirst({
    where: { conversation_id: conversationId, user_id: agentUserId, ended_at: null },
  });
  if (!assignment) {
    await getPrisma().$transaction([
      getPrisma().conversationAssignment.create({
        data: {
          conversation_id: conversationId,
          user_id: agentUserId,
          reason: "manual_answer",
        },
      }),
      getPrisma().conversation.update({
        where: { id: conversationId },
        data: { status: "ASSIGNED" },
      }),
    ]);
  }

  await ringAgentForConversation(io, conversationId, agentUserId);
}

export async function rejectConversationCall(
  io: Server | null,
  conversationId: string
): Promise<void> {
  const conversation = await getPrisma().conversation.findUnique({
    where: { id: conversationId },
    include: { channel: true },
  });
  if (!conversation?.channel) {
    throw new HttpError(404, "Conversación no encontrada");
  }
  if (!conversation.source_ref_id?.trim()) {
    throw new HttpError(409, "No hay canal de llamada activo para rechazar");
  }

  const cfg = parseVoiceConfigOrThrow(conversation.channel);
  const ari = createAriClient(cfg);
  try {
    await ari.hangupChannel(conversation.source_ref_id);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "ARI hangup failed";
    throw new HttpError(503, detail);
  }

  await getPrisma().conversation.update({
    where: { id: conversationId },
    data: { status: "ABANDONED" },
  });

  emitTenantLiveEvent(io, getCurrentTenantKey(), "voice:failed", {
    conversationId,
    reason: "rejected",
  });
}

export async function hangupConversationCall(
  io: Server | null,
  conversationId: string
): Promise<void> {
  const conversation = await getPrisma().conversation.findUnique({
    where: { id: conversationId },
    include: { channel: true },
  });
  if (!conversation?.channel || !conversation.source_ref_id) return;

  const cfg = parseVoiceChannelConfig(conversation.channel.config);
  const ari = createAriClient(cfg);
  const session = await getVoiceSession(conversation.source_ref_id);

  await ari.hangupChannel(conversation.source_ref_id).catch(() => undefined);
  if (session?.agentChannelId) await ari.hangupChannel(session.agentChannelId).catch(() => undefined);
  if (session?.trunkChannelId) await ari.hangupChannel(session.trunkChannelId).catch(() => undefined);

  await handleStasisEnd(io, conversation.channel, {
    channel: { id: conversation.source_ref_id },
  });
}
