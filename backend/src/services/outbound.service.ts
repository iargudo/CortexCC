import { getPrisma } from "../lib/prisma.js";
import { userRoom } from "../lib/socketRooms.js";
import { getCurrentTenantKey } from "../lib/tenantContext.js";
import { createAdapterForType } from "../channels/registry.js";
import type { Server } from "socket.io";

export async function deliverOutboundMessage(messageId: string, io: Server | null): Promise<void> {
  const msg = await getPrisma().message.findUnique({
    where: { id: messageId },
    include: {
      attachments: true,
      conversation: { include: { channel: true, contact: true, queue: { select: { name: true } } } },
    },
  });
  if (!msg || msg.is_internal) return;
  if (msg.sender_type !== "AGENT" && msg.sender_type !== "BOT") return;

  const conv = msg.conversation;
  const adapter = createAdapterForType(conv.channel.type);
  await adapter.initialize(conv.channel);

  const result = await adapter.sendMessage(
    { ...conv, channel: conv.channel },
    {
      content: msg.content,
      content_type: msg.content_type,
      attachments:
        msg.attachments?.map((a) => ({
          url: a.storage_url,
          filename: a.filename,
          mime_type: a.mime_type,
        })) ?? [],
      metadata: {
        ...((msg.metadata as Record<string, unknown>) ?? {}),
        ...(msg.email_subject ? { subject: msg.email_subject } : {}),
        ...(msg.email_cc ? { cc: msg.email_cc } : {}),
      },
    }
  );

  await getPrisma().message.update({
    where: { id: messageId },
    data: {
      delivery_status: result.ok ? "delivered" : "failed",
      error_message: result.error ?? null,
    },
  });

  const room = `conversation:${msg.conversation_id}`;
  io?.to(room).emit("message:delivery_update", {
    message_id: messageId,
    conversation_id: msg.conversation_id,
    delivery_status: result.ok ? "delivered" : "failed",
  });

  const assignments = await getPrisma().conversationAssignment.findMany({
    where: { conversation_id: msg.conversation_id, ended_at: null },
    select: { user_id: true },
  });
  const tenantKey = getCurrentTenantKey();
  for (const a of assignments) {
    io?.to(userRoom(tenantKey, a.user_id)).emit("message:delivery_update", {
      message_id: messageId,
      conversation_id: msg.conversation_id,
      delivery_status: result.ok ? "delivered" : "failed",
    });
  }
}
