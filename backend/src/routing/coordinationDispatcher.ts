import { getPrisma } from "../lib/prisma.js";
import { getRedis } from "../lib/redis.js";
import { getCurrentTenantKey } from "../lib/tenantContext.js";
import { enqueueRouting } from "../queue/bull.js";

/**
 * Two-level routing (level 1): distributes new conversations cyclically
 * (Round Robin) across the queues that share a `rotation_group`.
 *
 * The mechanism is fully generic: any tenant can group queues by setting the
 * same `rotation_group` on them and binding them to the entry channel(s). The
 * rotation cursor is global per group (not per channel), so multiple entry
 * channels feeding the same group still distribute evenly across the queues.
 */

/** Active queues in a rotation group, ordered by `rotation_order` then id. */
export async function listRotationQueueIds(rotationGroup: string): Promise<string[]> {
  const queues = await getPrisma().queue.findMany({
    where: { rotation_group: rotationGroup, is_active: true },
    orderBy: [{ rotation_order: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return queues.map((q) => q.id);
}

/** Maps a monotonically increasing cursor to a cyclic index (1→0, 2→1, ...). */
export function rotationIndex(cursor: number, length: number): number {
  if (length <= 0) return 0;
  return (((cursor - 1) % length) + length) % length;
}

/** Picks the next queue in the group using an atomic Redis cursor. */
export async function pickNextRotationQueueId(rotationGroup: string): Promise<string | null> {
  const queueIds = await listRotationQueueIds(rotationGroup);
  if (queueIds.length === 0) return null;
  if (queueIds.length === 1) return queueIds[0];

  const tenantKey = getCurrentTenantKey();
  const cursor = await getRedis().incr(`rr:coordination:${tenantKey}:${rotationGroup}`);
  return queueIds[rotationIndex(cursor, queueIds.length)];
}

/**
 * Resolves the rotation group configured for an entry channel, based on the
 * queues bound to it (QueueChannel) that participate in a rotation.
 */
export async function resolveRotationGroupForChannel(channelId: string): Promise<string | null> {
  const bindings = await getPrisma().queueChannel.findMany({
    where: {
      channel_id: channelId,
      queue: { is_active: true, rotation_group: { not: null } },
    },
    select: { queue: { select: { rotation_group: true } } },
  });
  for (const b of bindings) {
    if (b.queue.rotation_group) return b.queue.rotation_group;
  }
  return null;
}

/**
 * Decides the queue for a newly created inbound conversation.
 * If the channel feeds a rotation group, applies Round Robin across it;
 * otherwise falls back to the first active queue (legacy behavior).
 */
export async function resolveInboundQueueId(channelId: string): Promise<string | undefined> {
  const group = await resolveRotationGroupForChannel(channelId);
  if (group) {
    const picked = await pickNextRotationQueueId(group);
    if (picked) return picked;
  }
  const fallback = await getPrisma().queue.findFirst({ where: { is_active: true }, select: { id: true } });
  return fallback?.id;
}

/**
 * When an agent frees capacity, pulls the next waiting conversation(s) in a
 * queue (respecting order: higher priority first, then oldest) by re-enqueuing
 * them for routing. This is what makes a saturated queue drain in order.
 */
export async function routeNextWaitingInQueue(queueId: string, limit = 1): Promise<void> {
  const waiting = await getPrisma().conversation.findMany({
    where: { queue_id: queueId, status: "WAITING" },
    orderBy: [{ priority: "desc" }, { created_at: "asc" }],
    take: limit,
    select: { id: true },
  });
  for (const c of waiting) {
    await enqueueRouting({ conversationId: c.id });
  }
}

/**
 * When an agent becomes available (e.g. sets status ONLINE), drains waiting
 * conversations in the queues of the teams the agent belongs to, so backlog is
 * picked up without waiting for a new inbound message.
 */
export async function routeWaitingForUser(userId: string, perQueueLimit = 5): Promise<void> {
  const memberships = await getPrisma().teamMember.findMany({
    where: { user_id: userId },
    select: { team_id: true },
  });
  const teamIds = memberships.map((m) => m.team_id);
  if (teamIds.length === 0) return;

  const queues = await getPrisma().queue.findMany({
    where: { is_active: true, team_id: { in: teamIds } },
    select: { id: true },
  });
  for (const q of queues) {
    await routeNextWaitingInQueue(q.id, perQueueLimit);
  }
}
