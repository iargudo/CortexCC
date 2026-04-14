import type { ConversationStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { mapConversation, mapMessage, type ActiveAssigneeInfo } from "./conversationMapper.js";
import { enqueueOutbound, enqueueRouting, enqueueSlaCheck } from "../queue/bull.js";
import { mapChannelType } from "../lib/channelTypes.js";
import * as contactService from "./contact.service.js";

const messageInclude = {
  attachments: true,
  sender: { select: { first_name: true, last_name: true } },
} as const;

const convInclude = {
  channel: true,
  contact: { include: { tags: { include: { tag: true } } } },
  queue: { select: { name: true } },
  messages: { orderBy: { created_at: "asc" as const }, take: 200, include: messageInclude },
} as const;

async function activeAssignee(conversationId: string): Promise<ActiveAssigneeInfo | null> {
  const a = await prisma.conversationAssignment.findFirst({
    where: { conversation_id: conversationId, ended_at: null },
    include: { user: true },
  });
  if (!a?.user) return null;
  return {
    userId: a.user_id,
    displayName: `${a.user.first_name} ${a.user.last_name}`.trim(),
  };
}

/** Quien consulta o muta la conversación (inbox / API autenticada). */
export type ConversationViewer = { userId: string; isSupervisor: boolean };

/** Agente: cola (WAITING) o asignación activa propia. Supervisor/admin: todo. */
export async function assertAgentCanAccessConversation(
  conversationId: string,
  viewer: ConversationViewer
): Promise<void> {
  if (viewer.isSupervisor) return;
  const ok = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [
        { status: "WAITING" },
        { assignments: { some: { user_id: viewer.userId, ended_at: null } } },
      ],
    },
    select: { id: true },
  });
  if (!ok) throw new HttpError(403, "No tienes acceso a esta conversación");
}

const CONVERSATION_STATUS_FILTERS: ReadonlySet<string> = new Set([
  "WAITING",
  "ASSIGNED",
  "ACTIVE",
  "ON_HOLD",
  "WRAP_UP",
  "RESOLVED",
  "ABANDONED",
  "TRANSFERRED",
]);

/** Carga y mapea sin comprobar permisos (respuestas tras mutaciones ya autorizadas p. ej. resolve/transfer). */
async function getConversationMapped(id: string) {
  const c = await prisma.conversation.findUnique({
    where: { id },
    include: convInclude,
  });
  if (!c) throw new HttpError(404, "Not found");
  const assignee = await activeAssignee(c.id);
  return mapConversation(c, assignee);
}

export async function listConversations(params: {
  userId: string;
  tab?: string;
  channel?: string;
  status?: string;
  page: number;
  limit: number;
  isSupervisor: boolean;
}) {
  const { userId, channel, status, page, limit, isSupervisor } = params;
  let tab = params.tab ?? "mine";
  if (tab !== "mine" && tab !== "queue" && tab !== "all") tab = "mine";
  const skip = (page - 1) * limit;

  const where: Prisma.ConversationWhereInput = {};

  if (channel) {
    where.channel = { type: mapChannelType(channel) };
  }
  if (status) {
    const su = status.toUpperCase();
    if (CONVERSATION_STATUS_FILTERS.has(su)) {
      where.status = su as ConversationStatus;
    }
  }

  if (tab === "mine") {
    where.assignments = { some: { user_id: userId, ended_at: null } };
  } else if (tab === "queue") {
    where.status = "WAITING";
  } else if (tab === "all") {
    if (!isSupervisor) {
      throw new HttpError(403, "Forbidden");
    }
  }

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: convInclude,
      orderBy: { updated_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.conversation.count({ where }),
  ]);

  const items = await Promise.all(
    rows.map(async (c) => mapConversation(c, await activeAssignee(c.id)))
  );

  return { data: items, meta: { page, limit, total } };
}

export async function getConversation(id: string, viewer?: ConversationViewer) {
  if (viewer) await assertAgentCanAccessConversation(id, viewer);
  return getConversationMapped(id);
}

export async function acceptConversation(conversationId: string, userId: string) {
  const assignment = await prisma.conversationAssignment.findFirst({
    where: { conversation_id: conversationId, user_id: userId, ended_at: null },
  });
  if (!assignment) {
    throw new HttpError(
      404,
      "No hay asignación pendiente para tu usuario en esta conversación (puede estar asignada a otro agente)."
    );
  }
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "ACTIVE", wait_time_seconds: null },
    }),
    prisma.conversationAssignment.update({
      where: { id: assignment.id },
      data: { accepted_at: new Date() },
    }),
  ]);
  return getConversation(conversationId, { userId, isSupervisor: false });
}

export async function rejectConversation(conversationId: string, userId: string) {
  const assignment = await prisma.conversationAssignment.findFirst({
    where: { conversation_id: conversationId, user_id: userId, ended_at: null },
  });
  if (!assignment) {
    throw new HttpError(
      404,
      "No hay asignación pendiente para tu usuario en esta conversación (puede estar asignada a otro agente)."
    );
  }
  await prisma.$transaction([
    prisma.conversationAssignment.update({
      where: { id: assignment.id },
      data: { ended_at: new Date(), reason: "rejected" },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "WAITING" },
    }),
  ]);
  await enqueueRouting({ conversationId });
  return { ok: true };
}

export async function holdConversation(conversationId: string, viewer: ConversationViewer) {
  await assertAgentCanAccessConversation(conversationId, viewer);
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true },
  });
  if (!conv) throw new HttpError(404, "Not found");
  if (conv.status !== "ACTIVE" && conv.status !== "WRAP_UP") {
    throw new HttpError(400, "Solo puedes poner en espera una conversación activa o en cierre.");
  }
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "ON_HOLD" },
  });
  return getConversation(conversationId, viewer);
}

export async function resumeConversation(conversationId: string, viewer: ConversationViewer) {
  await assertAgentCanAccessConversation(conversationId, viewer);
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true },
  });
  if (!conv) throw new HttpError(404, "Not found");
  if (conv.status !== "ON_HOLD") {
    throw new HttpError(400, "La conversación no está en espera.");
  }
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "ACTIVE" },
  });
  return getConversation(conversationId, viewer);
}

export async function resolveConversation(
  conversationId: string,
  dispositionId: string,
  note: string | undefined,
  viewer: ConversationViewer
) {
  await assertAgentCanAccessConversation(conversationId, viewer);
  if (!viewer.isSupervisor) {
    const mine = await prisma.conversationAssignment.findFirst({
      where: { conversation_id: conversationId, user_id: viewer.userId, ended_at: null },
    });
    if (!mine) {
      throw new HttpError(403, "No tienes una asignación activa; no puedes resolver esta conversación.");
    }
  }
  const disposition = await prisma.disposition.findUnique({ where: { id: dispositionId } });
  if (!disposition) throw new HttpError(400, "Invalid disposition");
  if (disposition.requires_note && !note) {
    throw new HttpError(400, "Note required");
  }
  await prisma.$transaction(async (tx) => {
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        status: "RESOLVED",
        disposition_id: dispositionId,
        wrap_up_notes: note,
        resolved_at: new Date(),
      },
    });
    await tx.conversationAssignment.updateMany({
      where: { conversation_id: conversationId, ended_at: null },
      data: { ended_at: new Date() },
    });
  });
  return getConversationMapped(conversationId);
}

export async function transferConversation(
  conversationId: string,
  body: {
    target_type?: string;
    target_id?: string;
    queue_id?: string;
    reason?: string;
  },
  fromUserId: string | undefined,
  isSupervisor: boolean
) {
  if (!fromUserId) throw new HttpError(401, "Unauthorized");
  await assertAgentCanAccessConversation(conversationId, { userId: fromUserId, isSupervisor });
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new HttpError(404, "Not found");

  if (!isSupervisor && conv.status !== "WAITING") {
    const mine = await prisma.conversationAssignment.findFirst({
      where: { conversation_id: conversationId, user_id: fromUserId, ended_at: null },
    });
    if (!mine) {
      throw new HttpError(403, "No tienes una asignación activa en esta conversación.");
    }
  }

  if (body.queue_id) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        queue_id: body.queue_id,
        status: "WAITING",
      },
    });
    await prisma.transfer.create({
      data: {
        conversation_id: conversationId,
        from_user_id: fromUserId,
        from_queue_id: conv.queue_id,
        to_queue_id: body.queue_id,
        reason: body.reason,
        transfer_type: "agent_to_queue",
      },
    });
    await prisma.conversationAssignment.updateMany({
      where: { conversation_id: conversationId, ended_at: null },
      data: { ended_at: new Date() },
    });
    await enqueueRouting({ conversationId });
    return getConversationMapped(conversationId);
  }

  if (body.target_id && (body.target_type === "agent" || body.target_type === "supervisor")) {
    await prisma.$transaction(async (tx) => {
      await tx.conversationAssignment.updateMany({
        where: { conversation_id: conversationId, ended_at: null },
        data: { ended_at: new Date() },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { status: "ASSIGNED" },
      });
      await tx.conversationAssignment.create({
        data: {
          conversation_id: conversationId,
          user_id: body.target_id!,
          reason: body.reason ?? "transfer",
        },
      });
      await tx.transfer.create({
        data: {
          conversation_id: conversationId,
          from_user_id: fromUserId,
          to_user_id: body.target_id,
          reason: body.reason,
          transfer_type: "agent_to_agent",
        },
      });
    });
    return getConversationMapped(conversationId);
  }

  throw new HttpError(400, "Invalid transfer payload");
}

export async function appendMessage(
  conversationId: string,
  input: {
    userId?: string;
    content: string;
    content_type?: string;
    is_internal?: boolean;
    sender_type?: "AGENT" | "SYSTEM" | "BOT";
    metadata?: Record<string, unknown>;
    email_subject?: string;
    email_cc?: string;
    attachments?: Array<{ filename: string; mime_type: string; size_bytes: number; storage_url: string }>;
  },
  viewer: ConversationViewer
) {
  await assertAgentCanAccessConversation(conversationId, viewer);
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, status: true },
  });
  if (!conv) throw new HttpError(404, "Not found");

  const sender = input.sender_type ?? "AGENT";
  const outboundToContact = !input.is_internal && sender === "AGENT";
  if (outboundToContact && !viewer.isSupervisor) {
    const ok: ConversationStatus[] = ["ACTIVE", "ON_HOLD", "WRAP_UP"];
    if (!ok.includes(conv.status)) {
      throw new HttpError(
        400,
        "Solo puedes enviar mensajes al contacto cuando la conversación está activa, en espera o en cierre."
      );
    }
  }

  const msg = await prisma.message.create({
    data: {
      conversation_id: conversationId,
      sender_type: input.sender_type ?? "AGENT",
      sender_id: input.userId,
      content: input.content,
      content_type: (input.content_type?.toUpperCase() as "TEXT" | "EMAIL" | "IMAGE" | "FILE" | "AUDIO" | "VIDEO") || "TEXT",
      metadata: input.metadata as object | undefined,
      email_subject: input.email_subject ?? undefined,
      email_cc: input.email_cc ?? undefined,
      is_internal: Boolean(input.is_internal),
      attachments:
        input.attachments && input.attachments.length > 0
          ? {
              create: input.attachments.map((a) => ({
                filename: a.filename,
                mime_type: a.mime_type,
                size_bytes: a.size_bytes,
                storage_url: a.storage_url,
              })),
            }
          : undefined,
    },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      last_message_preview: input.content.slice(0, 200),
      last_message_at: new Date(),
    },
  });

  if (!input.is_internal && (input.sender_type ?? "AGENT") === "AGENT") {
    await enqueueOutbound({ messageId: msg.id });
  }

  return msg;
}

export async function listMessages(
  conversationId: string,
  page: number,
  limit: number,
  viewer: ConversationViewer
) {
  await assertAgentCanAccessConversation(conversationId, viewer);
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
      include: messageInclude,
    }),
    prisma.message.count({ where: { conversation_id: conversationId } }),
  ]);
  return {
    data: rows.reverse().map((m) => mapMessage(m)),
    meta: { page, limit, total },
  };
}

export async function createConversationFromEscalation(data: {
  channelId: string;
  contactId: string;
  queueId?: string | null;
  source: string;
  sourceRef?: string;
  reason?: string;
  context?: unknown;
  priority?: number;
  subject?: string;
}) {
  const queue =
    (data.queueId &&
      (await prisma.queue.findFirst({
        where: { OR: [{ id: data.queueId }, { name: data.queueId }] },
      }))) ||
    (await prisma.queue.findFirst({ where: { is_active: true } }));

  const conv = await prisma.conversation.create({
    data: {
      channel_id: data.channelId,
      contact_id: data.contactId,
      queue_id: queue?.id,
      status: "WAITING",
      priority: data.priority ?? 5,
      source: data.source,
      source_ref_id: data.sourceRef,
      escalation_reason: data.reason,
      escalation_context: data.context as object | undefined,
      subject: data.subject,
    },
  });
  await enqueueRouting({ conversationId: conv.id });
  if (queue?.id) {
    await enqueueSlaCheck({ conversationId: conv.id, queueId: queue.id });
  }
  return conv.id;
}

export async function getEscalationContext(id: string, viewer: ConversationViewer) {
  await assertAgentCanAccessConversation(id, viewer);
  const c = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      source: true,
      source_ref_id: true,
      escalation_reason: true,
      escalation_context: true,
      channel: { select: { type: true, name: true } },
      contact: { select: { id: true, name: true, phone: true, email: true, source_system: true } },
      queue: { select: { id: true, name: true } },
    },
  });
  if (!c) throw new HttpError(404, "Not found");
  return {
    conversation_id: c.id,
    source: c.source,
    source_ref_id: c.source_ref_id,
    escalation_reason: c.escalation_reason,
    escalation_context: c.escalation_context,
    channel: c.channel,
    contact: c.contact,
    queue: c.queue,
  };
}

export async function createManualConversation(
  userId: string,
  body: {
    channel_id?: string;
    channel_type?: string;
    contact_id?: string;
    contact?: { name: string; email?: string; phone?: string; tags?: string[] };
    queue_id?: string;
    subject?: string;
    priority?: number;
    initial_message?: string;
  },
  getViewer: ConversationViewer
) {
  let contactId = body.contact_id;
  if (!contactId) {
    if (!body.contact?.name) throw new HttpError(400, "contact_id or contact.name required");
    const created = await contactService.createContact(body.contact);
    contactId = created.id;
  }

  let channelId = body.channel_id;
  if (!channelId && body.channel_type) {
    const ch = await prisma.channel.findFirst({ where: { type: mapChannelType(body.channel_type) } });
    channelId = ch?.id;
  }
  if (!channelId) throw new HttpError(400, "channel_id or channel_type required");

  const queue =
    (body.queue_id &&
      (await prisma.queue.findFirst({
        where: { OR: [{ id: body.queue_id }, { name: body.queue_id }] },
      }))) ||
    (await prisma.queue.findFirst({ where: { is_active: true } }));

  const conv = await prisma.conversation.create({
    data: {
      channel_id: channelId,
      contact_id: contactId,
      queue_id: queue?.id,
      status: "WAITING",
      priority: body.priority ?? 5,
      source: "direct",
      subject: body.subject,
    },
  });

  if (body.initial_message?.trim()) {
    const m = await prisma.message.create({
      data: {
        conversation_id: conv.id,
        sender_type: "AGENT",
        sender_id: userId,
        content: body.initial_message.trim(),
        content_type: "TEXT",
        is_internal: false,
      },
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        last_message_preview: body.initial_message.trim().slice(0, 200),
        last_message_at: new Date(),
      },
    });
    await enqueueOutbound({ messageId: m.id });
  }

  await enqueueRouting({ conversationId: conv.id });
  if (queue?.id) {
    await enqueueSlaCheck({ conversationId: conv.id, queueId: queue.id });
  }

  return getConversation(conv.id, getViewer);
}

/** Búsqueda rápida para cabecera: conversaciones visibles + contactos. */
export async function inboxGlobalSearch(params: {
  userId: string;
  q: string;
  limit: number;
  isSupervisor: boolean;
}) {
  const term = params.q.trim();
  if (term.length < 2) return { conversations: [], contacts: [] };

  const visibility: Prisma.ConversationWhereInput = params.isSupervisor
    ? {}
    : {
        OR: [
          { assignments: { some: { user_id: params.userId, ended_at: null } } },
          { status: "WAITING" },
        ],
      };

  const textSearch: Prisma.ConversationWhereInput = {
    OR: [
      { contact: { name: { contains: term, mode: "insensitive" } } },
      { contact: { email: { contains: term, mode: "insensitive" } } },
      { contact: { phone: { contains: term, mode: "insensitive" } } },
      { contact: { phone_wa: { contains: term, mode: "insensitive" } } },
      { last_message_preview: { contains: term, mode: "insensitive" } },
    ],
  };

  const where: Prisma.ConversationWhereInput = params.isSupervisor
    ? textSearch
    : { AND: [visibility, textSearch] };

  const rows = await prisma.conversation.findMany({
    where,
    include: convInclude,
    orderBy: { updated_at: "desc" },
    take: params.limit,
  });

  const conversations = await Promise.all(
    rows.map(async (c) => mapConversation(c, await activeAssignee(c.id)))
  );

  const contactsRes = await contactService.listContacts(term, 1, Math.min(5, params.limit));

  return {
    conversations,
    contacts: contactsRes.data,
  };
}
