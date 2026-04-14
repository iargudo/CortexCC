import { prisma } from "../lib/prisma.js";
import { enqueueRouting } from "../queue/bull.js";

const OPEN_STATUSES = ["WAITING", "ASSIGNED", "ACTIVE", "ON_HOLD", "WRAP_UP"] as const;
const STATUS_PRIORITY: Record<(typeof OPEN_STATUSES)[number], number> = {
  ACTIVE: 5,
  ON_HOLD: 4,
  WRAP_UP: 3,
  ASSIGNED: 2,
  WAITING: 1,
};

function getStatusPriority(status: string): number {
  return STATUS_PRIORITY[status as keyof typeof STATUS_PRIORITY] ?? 0;
}

export type EmailInboundInput = {
  messageId: string;
  fromEmail: string;
  fromName?: string;
  subject?: string;
  text: string;
  htmlBody?: string;
  cc?: string;
  inReplyTo?: string;
  date?: Date;
  attachments?: Array<{
    filename: string;
    mime_type: string;
    size_bytes: number;
    url: string;
  }>;
};

export async function ingestEmailIncoming(
  channelId: string,
  incoming: EmailInboundInput
): Promise<{ conversation_id: string; message_id: string; created_conversation: boolean }> {
  const fromEmail = incoming.fromEmail.trim().toLowerCase();
  if (!fromEmail) throw new Error("Incoming email missing sender");

  const already = await prisma.message.findFirst({
    where: { email_message_id: incoming.messageId },
    select: { id: true, conversation_id: true },
  });
  if (already) {
    return { conversation_id: already.conversation_id, message_id: already.id, created_conversation: false };
  }

  const existingContact =
    (await prisma.contact.findFirst({
      where: { email: { equals: fromEmail, mode: "insensitive" } },
    })) ??
    (await prisma.contact.findFirst({
      where: { external_id: fromEmail, source_system: "email" },
    }));

  const contact =
    existingContact ??
    (await prisma.contact.create({
      data: {
        name: incoming.fromName,
        email: fromEmail,
        external_id: fromEmail,
        source_system: "email",
      },
    }));

  if (existingContact && incoming.fromName && incoming.fromName !== existingContact.name) {
    await prisma.contact.update({
      where: { id: existingContact.id },
      data: { name: incoming.fromName, email: fromEmail },
    });
  }

  const candidates = await prisma.conversation.findMany({
    where: {
      channel_id: channelId,
      contact_id: contact.id,
      status: { in: [...OPEN_STATUSES] },
    },
    orderBy: [{ updated_at: "desc" }, { last_message_at: "desc" }, { created_at: "desc" }],
    take: 20,
  });
  let conversation = candidates.sort((a, b) => {
    const byStatus = getStatusPriority(b.status) - getStatusPriority(a.status);
    if (byStatus !== 0) return byStatus;
    return (b.updated_at?.getTime() ?? 0) - (a.updated_at?.getTime() ?? 0);
  })[0];

  let createdConversation = false;
  if (!conversation) {
    const defaultQueue = await prisma.queue.findFirst({ where: { is_active: true } });
    conversation = await prisma.conversation.create({
      data: {
        channel_id: channelId,
        contact_id: contact.id,
        queue_id: defaultQueue?.id,
        status: "WAITING",
        source: "direct",
        subject: incoming.subject,
        last_message_at: incoming.date ?? new Date(),
      },
    });
    createdConversation = true;
  }

  const text = incoming.text.trim() || "[Correo recibido]";
  const htmlBody = incoming.htmlBody?.trim() || undefined;
  const msg = await prisma.message.create({
    data: {
      conversation_id: conversation.id,
      sender_type: "CONTACT",
      content: htmlBody || text,
      content_type: "EMAIL",
      email_message_id: incoming.messageId,
      email_in_reply_to: incoming.inReplyTo,
      email_subject: incoming.subject,
      email_cc: incoming.cc,
      metadata: {
        from: fromEmail,
        ...(htmlBody ? { has_html: true } : {}),
      } as object,
      is_internal: false,
      delivery_status: "delivered",
      created_at: incoming.date ?? new Date(),
      attachments:
        incoming.attachments && incoming.attachments.length > 0
          ? {
              create: incoming.attachments.map((a) => ({
                filename: a.filename,
                mime_type: a.mime_type,
                size_bytes: a.size_bytes || 0,
                storage_url: a.url,
              })),
            }
          : undefined,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      subject: conversation.subject ?? incoming.subject,
      last_message_preview: text.slice(0, 200),
      last_message_at: incoming.date ?? new Date(),
      unread_agent_count: { increment: 1 },
    },
  });

  if (createdConversation) {
    await enqueueRouting({ conversationId: conversation.id });
  }

  return {
    conversation_id: conversation.id,
    message_id: msg.id,
    created_conversation: createdConversation,
  };
}
