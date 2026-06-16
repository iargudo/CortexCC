import type { ConversationStatus, SlaPolicy } from "@prisma/client";
import type { Server } from "socket.io";
import { getPrisma } from "../lib/prisma.js";
import { userRoom } from "../lib/socketRooms.js";
import { getCurrentTenantKey } from "../lib/tenantContext.js";
import { enqueueSlaCheck } from "../queue/bull.js";

const SKIP_STATUSES: ConversationStatus[] = ["ABANDONED"];
const MIN_CHECK_DELAY_MS = 5_000;

export function slaCheckDelayMs(
  createdAt: Date,
  targetSeconds: number,
  now = Date.now()
): number {
  const deadlineMs = createdAt.getTime() + targetSeconds * 1000;
  return Math.max(MIN_CHECK_DELAY_MS, deadlineMs - now);
}

export async function scheduleInitialSlaCheck(conversationId: string, queueId: string): Promise<void> {
  const queue = await getPrisma().queue.findUnique({
    where: { id: queueId },
    include: { sla_policy: true },
  });
  const policy = queue?.sla_policy;
  if (!policy) return;

  const conv = await getPrisma().conversation.findUnique({
    where: { id: conversationId },
    select: { created_at: true },
  });
  if (!conv) return;

  await enqueueSlaCheck(
    { conversationId, queueId },
    { delay: slaCheckDelayMs(conv.created_at, policy.first_response_seconds) }
  );
}

async function notifySlaBreach(
  io: Server | null,
  conversationId: string,
  queueId: string | null
): Promise<void> {
  if (!io || !queueId) return;
  const tenantKey = getCurrentTenantKey();
  const supervisors = await getPrisma().user.findMany({
    where: {
      roles: { some: { role: { name: { in: ["admin", "supervisor"] } } } },
    },
    select: { id: true },
  });
  for (const sup of supervisors) {
    io.to(userRoom(tenantKey, sup.id)).emit("notification:new", {
      type: "SLA_BREACH",
      conversation_id: conversationId,
      data: { queue_id: queueId },
    });
  }
}

export async function runSlaCheck(
  conversationId: string,
  queueId: string,
  io: Server | null
): Promise<void> {
  const conv = await getPrisma().conversation.findUnique({
    where: { id: conversationId },
    include: { queue: { include: { sla_policy: true } } },
  });
  if (!conv || SKIP_STATUSES.includes(conv.status) || conv.sla_breached) return;

  const policy: SlaPolicy | null | undefined = conv.queue?.sla_policy;
  if (!policy) return;

  const elapsedSec = Math.floor((Date.now() - conv.created_at.getTime()) / 1000);
  let breached = false;

  if (!conv.sla_first_response_at) {
    const firstAgentMsg = await getPrisma().message.findFirst({
      where: { conversation_id: conversationId, sender_type: "AGENT", is_internal: false },
      orderBy: { created_at: "asc" },
    });

    if (firstAgentMsg) {
      const frSec = Math.floor((firstAgentMsg.created_at.getTime() - conv.created_at.getTime()) / 1000);
      breached = frSec > policy.first_response_seconds;
      await getPrisma().conversation.update({
        where: { id: conversationId },
        data: {
          sla_first_response_at: firstAgentMsg.created_at,
          first_response_seconds: frSec,
          sla_breached: breached,
        },
      });
    } else if (elapsedSec > policy.first_response_seconds) {
      breached = true;
      await getPrisma().conversation.update({
        where: { id: conversationId },
        data: { sla_breached: true },
      });
    } else {
      await enqueueSlaCheck(
        { conversationId, queueId },
        { delay: slaCheckDelayMs(conv.created_at, policy.first_response_seconds) }
      );
      return;
    }
  }

  if (breached) {
    await notifySlaBreach(io, conversationId, conv.queue_id);
    return;
  }

  if (conv.status === "RESOLVED" && conv.resolved_at) {
    const resSec = Math.floor((conv.resolved_at.getTime() - conv.created_at.getTime()) / 1000);
    const resolutionBreached = resSec > policy.resolution_seconds;
    await getPrisma().conversation.update({
      where: { id: conversationId },
      data: {
        sla_resolution_at: conv.resolved_at,
        sla_breached: resolutionBreached,
      },
    });
    if (resolutionBreached) {
      await notifySlaBreach(io, conversationId, conv.queue_id);
    }
    return;
  }

  if (elapsedSec > policy.resolution_seconds) {
    await getPrisma().conversation.update({
      where: { id: conversationId },
      data: { sla_breached: true },
    });
    await notifySlaBreach(io, conversationId, conv.queue_id);
    return;
  }

  await enqueueSlaCheck(
    { conversationId, queueId },
    { delay: slaCheckDelayMs(conv.created_at, policy.resolution_seconds) }
  );
}
