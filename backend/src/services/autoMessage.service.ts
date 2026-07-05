import { getPrisma } from "../lib/prisma.js";
import { enqueueOutbound } from "../queue/bull.js";

/**
 * Crea un mensaje automático (sender BOT) en la conversación y lo despacha al
 * contacto por el canal correspondiente. Usado para respuestas de fuera de
 * horario y avisos de derivación por saturación (overflow).
 */
export async function sendAutomaticMessage(conversationId: string, content: string): Promise<void> {
  const text = content?.trim();
  if (!text) return;

  const msg = await getPrisma().message.create({
    data: {
      conversation_id: conversationId,
      sender_type: "BOT",
      content: text,
      content_type: "TEXT",
      is_internal: false,
      delivery_status: "queued",
    },
  });

  await getPrisma().conversation.update({
    where: { id: conversationId },
    data: { last_message_preview: text.slice(0, 200), last_message_at: new Date() },
  });

  await enqueueOutbound({ messageId: msg.id });
}
