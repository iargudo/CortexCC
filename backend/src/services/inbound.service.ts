import type { IncomingMessage } from "../channels/ChannelAdapter.js";
import { prisma } from "../lib/prisma.js";
import { canonicalPhone, phoneCandidates } from "../lib/phone.js";
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

function mapIncomingContentType(value: string | undefined): "TEXT" | "IMAGE" | "FILE" | "AUDIO" | "VIDEO" {
  const v = (value ?? "").toUpperCase();
  if (v === "IMAGE" || v === "FILE" || v === "AUDIO" || v === "VIDEO") return v;
  return "TEXT";
}

function fallbackTextByType(contentType: "TEXT" | "IMAGE" | "FILE" | "AUDIO" | "VIDEO"): string {
  if (contentType === "IMAGE") return "[Imagen recibida]";
  if (contentType === "VIDEO") return "[Video recibido]";
  if (contentType === "AUDIO") return "[Audio recibido]";
  if (contentType === "FILE") return "[Archivo recibido]";
  return "";
}

export async function ingestIncomingMessage(
  channelId: string,
  incoming: IncomingMessage
): Promise<{ conversation_id: string; message_id: string; created_conversation: boolean }> {
  const identifier = canonicalPhone(incoming.contact_identifier);
  if (!identifier) throw new Error("Incoming contact_identifier is invalid");
  const variants = phoneCandidates(identifier);

  const existingContact = await prisma.contact.findFirst({
    where: {
      OR: [{ phone_wa: { in: variants } }, { phone: { in: variants } }],
    },
  });

  const contact =
    existingContact ??
    (await prisma.contact.create({
      data: {
        name: incoming.contact_name,
        phone: identifier,
        phone_wa: identifier,
        source_system: "whatsapp",
      },
    }));

  if (existingContact && incoming.contact_name && incoming.contact_name !== existingContact.name) {
    await prisma.contact.update({
      where: { id: existingContact.id },
      data: { name: incoming.contact_name },
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
        last_message_at: incoming.timestamp,
      },
    });
    createdConversation = true;
  }

  const mappedType = mapIncomingContentType(incoming.content_type);
  const normalizedContent = incoming.content?.trim() || fallbackTextByType(mappedType);

  const msg = await prisma.message.create({
    data: {
      conversation_id: conversation.id,
      sender_type: "CONTACT",
      content: normalizedContent,
      content_type: mappedType,
      metadata: {
        ...(incoming.metadata ?? {}),
        external_message_id: incoming.external_id,
      } as object,
      is_internal: false,
      delivery_status: "delivered",
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
      last_message_preview:
        normalizedContent.slice(0, 200) ||
        (incoming.attachments?.length ? `[${incoming.content_type || "MEDIA"}]` : ""),
      last_message_at: incoming.timestamp,
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
