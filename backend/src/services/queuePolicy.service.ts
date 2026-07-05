import type { Server } from "socket.io";
import { getPrisma } from "../lib/prisma.js";
import { getCurrentTenantKey } from "../lib/tenantContext.js";
import { queueRoom, supervisorRoom } from "../lib/socketRooms.js";
import { isWithinSchedule } from "../lib/queueSchedule.js";
import { enqueueOverflowCheck, enqueueRouting } from "../queue/bull.js";
import { sendAutomaticMessage } from "./autoMessage.service.js";

const MIN_OVERFLOW_DELAY_MS = 5_000;

/**
 * Se ejecuta cuando una conversación nueva entra a una cola:
 * - Si la cola está fuera de horario, envía la auto-respuesta `out_of_hours_message`
 *   (la conversación igual se encola/enruta para quien siga en seguimiento).
 * - Programa la verificación de overflow si la cola tiene `overflow_queue_id`.
 */
export async function onConversationEnqueued(conversationId: string, queueId: string): Promise<void> {
  const queue = await getPrisma().queue.findUnique({
    where: { id: queueId },
    select: {
      schedule: true,
      out_of_hours_message: true,
      overflow_queue_id: true,
      max_wait_seconds: true,
    },
  });
  if (!queue) return;

  if (queue.out_of_hours_message && !isWithinSchedule(queue.schedule)) {
    await sendAutomaticMessage(conversationId, queue.out_of_hours_message);
  }

  if (queue.overflow_queue_id && queue.overflow_queue_id !== queueId) {
    const delay = Math.max(MIN_OVERFLOW_DELAY_MS, (queue.max_wait_seconds ?? 300) * 1000);
    await enqueueOverflowCheck({ conversationId, queueId }, { delay });
  }
}

/**
 * Deriva una conversación que ha esperado demasiado (sin asignar) a la cola de
 * overflow configurada. Es single-shot por diseño: mueve una vez a la cola de
 * respaldo; evita ping-pong entre colas.
 */
export async function runOverflowCheck(
  conversationId: string,
  queueId: string,
  io: Server | null
): Promise<void> {
  const conv = await getPrisma().conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, status: true, queue_id: true },
  });
  if (!conv) return;
  // Ya fue atendida, cerrada o movida de cola: nada que hacer.
  if (conv.status !== "WAITING" || conv.queue_id !== queueId) return;

  const activeAssignment = await getPrisma().conversationAssignment.findFirst({
    where: { conversation_id: conversationId, ended_at: null },
    select: { id: true },
  });
  if (activeAssignment) return;

  const queue = await getPrisma().queue.findUnique({
    where: { id: queueId },
    select: { overflow_queue_id: true, overflow_message: true },
  });
  const target = queue?.overflow_queue_id;
  if (!target || target === queueId) return;

  const targetQueue = await getPrisma().queue.findFirst({
    where: { id: target, is_active: true },
    select: { id: true },
  });
  if (!targetQueue) return;

  await getPrisma().conversation.update({
    where: { id: conversationId },
    data: { queue_id: target, status: "WAITING" },
  });

  if (queue?.overflow_message) {
    await sendAutomaticMessage(conversationId, queue.overflow_message);
  }

  await enqueueRouting({ conversationId });

  const tenantKey = getCurrentTenantKey();
  io?.to(queueRoom(tenantKey, queueId)).emit("queue:updated", { queueId });
  io?.to(queueRoom(tenantKey, target)).emit("queue:updated", { queueId: target });
  io?.to(supervisorRoom(tenantKey)).emit("supervisor:live_update", {
    type: "overflow",
    conversationId,
    queueId: target,
  });
}
