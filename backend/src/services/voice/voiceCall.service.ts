import type { ConversationStatus, Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "../../lib/prisma.js";
import { conversationRoom, emitTenantLiveEvent, userRoom } from "../../lib/socketRooms.js";
import { getCurrentTenantKey } from "../../lib/tenantContext.js";
import { enqueueRouting } from "../../queue/bull.js";
import { scheduleInitialSlaCheck } from "../slaCheck.service.js";
import type { Server } from "socket.io";

export type VoiceCallDirection = "inbound" | "outbound";
export type VoiceCallState = "ringing" | "active" | "hold" | "ended" | "unknown";

export type VoiceCallEventInput = {
  channelId?: string;
  conversationId?: string;
  contactId?: string;
  agentUserId?: string;
  externalCallId: string;
  asteriskChannelId?: string;
  bridgeId?: string;
  linkedid?: string;
  callerNumber?: string;
  dialedNumber?: string;
  callerName?: string;
  direction?: VoiceCallDirection;
  state: VoiceCallState;
  timestamp?: Date;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
  raw?: unknown;
};

const OPEN_STATUSES: ConversationStatus[] = ["WAITING", "ASSIGNED", "ACTIVE", "ON_HOLD", "WRAP_UP"];

export function normalizePhoneNumber(value: string | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return null;
  const plus = cleaned.startsWith("+") ? "+" : "";
  const digits = cleaned.replace(/[^\d]/g, "");
  if (!digits) return null;
  return `${plus}${digits}`;
}

function previewByState(state: VoiceCallState): string {
  if (state === "ringing") return "[Llamada entrante]";
  if (state === "active") return "[Llamada en curso]";
  if (state === "hold") return "[Llamada en espera]";
  if (state === "ended") return "[Llamada finalizada]";
  return "[Evento de llamada]";
}

async function findOrCreateContact(input: VoiceCallEventInput) {
  if (input.contactId) {
    const existing = await getPrisma().contact.findUnique({ where: { id: input.contactId } });
    if (existing) return existing;
  }

  const caller = normalizePhoneNumber(input.callerNumber);
  const dialed = normalizePhoneNumber(input.dialedNumber);
  const lookup = caller ?? dialed;

  if (!lookup) {
    return getPrisma().contact.create({
      data: {
        name: input.callerName || "Llamada anónima",
        source_system: "voice",
      },
    });
  }

  const existing = await getPrisma().contact.findFirst({
    where: { OR: [{ phone: lookup }, { phone_wa: lookup }] },
  });

  if (existing) return existing;

  return getPrisma().contact.create({
    data: {
      name: input.callerName || lookup,
      phone: lookup,
      source_system: "voice",
    },
  });
}

async function findOrCreateConversation(input: VoiceCallEventInput, contactId: string) {
  if (input.conversationId) {
    const existingConversation = await getPrisma().conversation.findUnique({
      where: { id: input.conversationId },
    });
    if (!existingConversation) {
      throw new Error("Conversation not found for voice call event");
    }
    return { conversation: existingConversation, created: false, pinned: true };
  }

  if (!input.channelId) {
    throw new Error("channelId is required when conversationId is not provided");
  }

  const byExternal = await getPrisma().conversation.findFirst({
    where: {
      channel_id: input.channelId,
      source: "voice",
      source_ref_id: input.externalCallId,
    },
  });
  if (byExternal) return { conversation: byExternal, created: false, pinned: false };

  const open = await getPrisma().conversation.findFirst({
    where: {
      channel_id: input.channelId,
      contact_id: contactId,
      status: { in: OPEN_STATUSES },
      ...(input.direction === "outbound" ? {} : {}),
    },
    orderBy: { updated_at: "desc" },
  });
  if (open && input.direction !== "outbound") return { conversation: open, created: false, pinned: false };

  const defaultQueue = await getPrisma().queue.findFirst({ where: { is_active: true } });
  const created = await getPrisma().conversation.create({
    data: {
      channel_id: input.channelId,
      contact_id: contactId,
      queue_id: defaultQueue?.id,
      status: "WAITING",
      source: "voice",
      source_ref_id: input.externalCallId,
      subject: normalizePhoneNumber(input.dialedNumber) || normalizePhoneNumber(input.callerNumber) || "Llamada de voz",
      last_message_at: input.timestamp ?? new Date(),
    },
  });
  return { conversation: created, created: true, pinned: false };
}

function statusByState(state: VoiceCallState): ConversationStatus | undefined {
  if (state === "ringing") return "WAITING";
  if (state === "active") return "ACTIVE";
  if (state === "hold") return "ON_HOLD";
  if (state === "ended") return "WRAP_UP";
  return undefined;
}

export async function upsertVoiceCallRecord(input: VoiceCallEventInput & { userId?: string }) {
  const lookupKey = input.asteriskChannelId ?? input.externalCallId;
  const existing = await getPrisma().voiceCall.findFirst({
    where: {
      OR: [
        ...(input.asteriskChannelId ? [{ asterisk_channel_id: input.asteriskChannelId }] : []),
        { external_call_id: input.externalCallId },
      ],
    },
    orderBy: { created_at: "desc" },
  });

  const remoteUri =
    normalizePhoneNumber(input.callerNumber) ??
    normalizePhoneNumber(input.dialedNumber) ??
    input.externalCallId;

  const data = {
    user_id: input.userId ?? input.agentUserId ?? existing?.user_id ?? null,
    conversation_id: input.conversationId ?? existing?.conversation_id ?? null,
    channel_id: input.channelId ?? existing?.channel_id ?? null,
    contact_id: input.contactId ?? existing?.contact_id ?? null,
    external_call_id: input.externalCallId,
    asterisk_channel_id: input.asteriskChannelId ?? existing?.asterisk_channel_id ?? null,
    bridge_id: input.bridgeId ?? existing?.bridge_id ?? null,
    linkedid: input.linkedid ?? existing?.linkedid ?? null,
    remote_uri: remoteUri,
    remote_display_name: input.callerName ?? existing?.remote_display_name ?? null,
    direction: input.direction ?? existing?.direction ?? "inbound",
    state: input.state,
    started_at:
      input.state === "ringing" && !existing?.started_at
        ? input.timestamp ?? new Date()
        : existing?.started_at ?? null,
    ended_at: input.state === "ended" ? input.timestamp ?? new Date() : existing?.ended_at ?? null,
    duration_seconds: input.durationSeconds ?? existing?.duration_seconds ?? null,
    metadata: {
      ...((existing?.metadata as Record<string, unknown>) ?? {}),
      ...(input.metadata ?? {}),
      lookup_key: lookupKey,
    } as Prisma.JsonObject,
  };

  if (existing) {
    return getPrisma().voiceCall.update({ where: { id: existing.id }, data });
  }

  return getPrisma().voiceCall.create({ data });
}

export async function ingestVoiceCallEvent(
  input: VoiceCallEventInput,
  io: Server | null,
  options?: { userId?: string; skipConversation?: boolean }
): Promise<{ conversationId: string | null; messageId: string | null; voiceCallId: string; createdConversation: boolean }> {
  let conversation: Awaited<ReturnType<PrismaClient["conversation"]["findUnique"]>> = null;
  let created = false;
  let pinned = false;
  let contactId = input.contactId;

  if (!options?.skipConversation) {
    if (input.conversationId) {
      const resolved = await findOrCreateConversation(input, contactId ?? "");
      conversation = resolved.conversation;
      created = resolved.created;
      pinned = resolved.pinned;
      contactId = conversation?.contact_id;
    } else if (input.channelId) {
      const contact = await findOrCreateContact(input);
      contactId = contact.id;
      const resolved = await findOrCreateConversation(input, contact.id);
      conversation = resolved.conversation;
      created = resolved.created;
      pinned = resolved.pinned;
    }
  } else if (input.conversationId) {
    conversation = await getPrisma().conversation.findUnique({ where: { id: input.conversationId } });
    contactId = conversation?.contact_id ?? input.contactId;
  }

  const voiceCall = await upsertVoiceCallRecord({
    ...input,
    conversationId: conversation?.id ?? input.conversationId,
    contactId: contactId ?? undefined,
    channelId: input.channelId ?? conversation?.channel_id,
    userId: options?.userId,
  });

  let messageId: string | null = null;

  if (conversation && !options?.skipConversation) {
    const now = input.timestamp ?? new Date();
    const metadata: Prisma.JsonObject = {
      external_call_id: input.externalCallId,
      voice_call_id: voiceCall.id,
      state: input.state,
      direction: input.direction ?? "inbound",
      caller_number: normalizePhoneNumber(input.callerNumber),
      dialed_number: normalizePhoneNumber(input.dialedNumber),
      asterisk_channel_id: input.asteriskChannelId ?? null,
      bridge_id: input.bridgeId ?? null,
      ...(input.durationSeconds !== undefined ? { duration_seconds: input.durationSeconds } : {}),
      ...(input.metadata ?? {}),
      raw: (input.raw ?? null) as Prisma.JsonValue,
    };

    const msg = await getPrisma().message.create({
      data: {
        conversation_id: conversation.id,
        sender_type: "SYSTEM",
        content_type: "VOICE_CALL",
        content: previewByState(input.state),
        metadata,
        call_duration_seconds: input.durationSeconds ?? null,
        is_internal: false,
        delivery_status: "delivered",
        created_at: now,
      },
      include: {
        attachments: true,
        sender: { select: { first_name: true, last_name: true } },
      },
    });
    messageId = msg.id;

    const nextStatus = statusByState(input.state);
    const shouldIncrementUnread =
      !pinned && input.state === "ringing" && (input.direction ?? "inbound") === "inbound" ? 1 : 0;

    await getPrisma().conversation.update({
      where: { id: conversation.id },
      data: {
        status: !pinned && nextStatus ? nextStatus : conversation.status,
        last_message_preview: msg.content,
        last_message_at: now,
        source_ref_id: pinned ? conversation.source_ref_id : input.externalCallId,
        unread_agent_count: { increment: shouldIncrementUnread },
      },
    });

    if (created) {
      await enqueueRouting({ conversationId: conversation.id });
      if (conversation.queue_id) {
        await scheduleInitialSlaCheck(conversation.id, conversation.queue_id);
      }
    }

    const tenantKey = getCurrentTenantKey();
    const mapMod = await import("../conversationMapper.js");
    const apiMessage = mapMod.mapMessage(msg);
    io?.to(conversationRoom(tenantKey, conversation.id)).emit("message:new", apiMessage);
    io?.to(conversationRoom(tenantKey, conversation.id)).emit("message:new", { conversationId: conversation.id });

    const assignments = await getPrisma().conversationAssignment.findMany({
      where: { conversation_id: conversation.id, ended_at: null },
      select: { user_id: true },
    });

    for (const assignment of assignments) {
      io?.to(userRoom(tenantKey, assignment.user_id)).emit("message:new", apiMessage);
      io?.to(userRoom(tenantKey, assignment.user_id)).emit("message:new", { conversationId: conversation.id });
    }
  }

  emitTenantLiveEvent(io, getCurrentTenantKey(), "voice:state", {
    voiceCallId: voiceCall.id,
    conversationId: conversation?.id ?? null,
    state: input.state,
    direction: input.direction ?? "inbound",
  });

  return {
    conversationId: conversation?.id ?? null,
    messageId,
    voiceCallId: voiceCall.id,
    createdConversation: created,
  };
}
