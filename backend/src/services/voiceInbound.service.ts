import type { ConversationStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { enqueueRouting } from "../queue/bull.js";
import type { Server } from "socket.io";

type VoiceCallDirection = "inbound" | "outbound";
type VoiceCallState = "ringing" | "active" | "hold" | "ended" | "unknown";

export type VoiceCallEventInput = {
  channelId?: string;
  conversationId?: string;
  externalCallId: string;
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

function normalizeNumber(value: string | undefined): string | null {
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
  const caller = normalizeNumber(input.callerNumber);
  const dialed = normalizeNumber(input.dialedNumber);
  const lookup = caller ?? dialed;

  if (!lookup) {
    return prisma.contact.create({
      data: {
        name: input.callerName || "Llamada anónima",
        source_system: "voice",
      },
    });
  }

  const existing = await prisma.contact.findFirst({
    where: { OR: [{ phone: lookup }, { phone_wa: lookup }] },
  });

  if (existing) return existing;

  return prisma.contact.create({
    data: {
      name: input.callerName || lookup,
      phone: lookup,
      source_system: "voice",
    },
  });
}

async function findOrCreateConversation(input: VoiceCallEventInput, contactId: string) {
  if (input.conversationId) {
    const existingConversation = await prisma.conversation.findUnique({
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

  const byExternal = await prisma.conversation.findFirst({
    where: {
      channel_id: input.channelId,
      source: "voice",
      source_ref_id: input.externalCallId,
    },
  });
  if (byExternal) return { conversation: byExternal, created: false, pinned: false };

  const open = await prisma.conversation.findFirst({
    where: {
      channel_id: input.channelId,
      contact_id: contactId,
      status: { in: OPEN_STATUSES },
    },
    orderBy: { updated_at: "desc" },
  });
  if (open) return { conversation: open, created: false, pinned: false };

  const defaultQueue = await prisma.queue.findFirst({ where: { is_active: true } });
  const created = await prisma.conversation.create({
    data: {
      channel_id: input.channelId,
      contact_id: contactId,
      queue_id: defaultQueue?.id,
      status: "WAITING",
      source: "voice",
      source_ref_id: input.externalCallId,
      subject: normalizeNumber(input.dialedNumber) || "Llamada de voz",
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

export async function ingestVoiceCallEvent(
  input: VoiceCallEventInput,
  io: Server | null
): Promise<{ conversationId: string; messageId: string; createdConversation: boolean }> {
  let conversation: Awaited<ReturnType<typeof prisma.conversation.findUnique>>;
  let created = false;
  let pinned = false;
  if (input.conversationId) {
    const resolved = await findOrCreateConversation(input, "");
    conversation = resolved.conversation;
    created = resolved.created;
    pinned = resolved.pinned;
  } else {
    const contact = await findOrCreateContact(input);
    const resolved = await findOrCreateConversation(input, contact.id);
    conversation = resolved.conversation;
    created = resolved.created;
    pinned = resolved.pinned;
  }

  if (!conversation) {
    throw new Error("Conversation unavailable for voice event");
  }

  const now = input.timestamp ?? new Date();
  const metadata: Prisma.JsonObject = {
    external_call_id: input.externalCallId,
    state: input.state,
    direction: input.direction ?? "inbound",
    caller_number: normalizeNumber(input.callerNumber),
    dialed_number: normalizeNumber(input.dialedNumber),
    ...(input.durationSeconds !== undefined ? { duration_seconds: input.durationSeconds } : {}),
    ...(input.metadata ?? {}),
    raw: (input.raw ?? null) as Prisma.JsonValue,
  };

  const msg = await prisma.message.create({
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

  const nextStatus = statusByState(input.state);
  const shouldIncrementUnread = !pinned && input.state === "ringing" && (input.direction ?? "inbound") === "inbound" ? 1 : 0;

  await prisma.conversation.update({
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
  }

  const mapMod = await import("./conversationMapper.js");
  const apiMessage = mapMod.mapMessage(msg);
  io?.to(`conversation:${conversation.id}`).emit("message:new", apiMessage);
  io?.to(`conversation:${conversation.id}`).emit("message:new", { conversationId: conversation.id });

  const assignments = await prisma.conversationAssignment.findMany({
    where: { conversation_id: conversation.id, ended_at: null },
    select: { user_id: true },
  });

  for (const assignment of assignments) {
    io?.to(`user:${assignment.user_id}`).emit("message:new", apiMessage);
    io?.to(`user:${assignment.user_id}`).emit("message:new", { conversationId: conversation.id });
  }

  return {
    conversationId: conversation.id,
    messageId: msg.id,
    createdConversation: created,
  };
}
