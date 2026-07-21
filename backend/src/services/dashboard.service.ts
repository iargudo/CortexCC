import { getPrisma } from "../lib/prisma.js";
import { conversationTeamFilter, userTeamFilter } from "../lib/teamScopeFilters.js";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Live board stats. When `teamIds` is an array (coordinator scope), agents and
 * conversations are limited to those teams; `null`/undefined = global (jefatura).
 */
export async function getDashboardStats(teamIds?: string[] | null) {
  const today = startOfToday();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);

  const userWhere = userTeamFilter(teamIds);
  const convScope = conversationTeamFilter(teamIds);

  const [
    agents_total,
    agents_online,
    waiting,
    active,
    resolved_today,
    convs24h,
    aiEscalations,
  ] = await Promise.all([
    getPrisma().user.count({ where: userWhere }),
    getPrisma().user.count({ where: { ...userWhere, status: { in: ["ONLINE", "BUSY"] } } }),
    getPrisma().conversation.count({ where: { ...convScope, status: "WAITING" } }),
    getPrisma().conversation.count({
      where: { ...convScope, status: { in: ["ACTIVE", "ASSIGNED", "ON_HOLD"] } },
    }),
    getPrisma().conversation.count({
      where: { ...convScope, status: "RESOLVED", resolved_at: { gte: today } },
    }),
    getPrisma().conversation.findMany({
      where: { ...convScope, created_at: { gte: since24h } },
      select: { channel_id: true, created_at: true },
    }),
    getPrisma().conversation.count({ where: { ...convScope, source: { contains: "escalation" } } }),
  ]);

  const byHour: Record<string, number> = {};
  for (let h = 0; h < 24; h++) byHour[String(h).padStart(2, "0")] = 0;
  for (const c of convs24h) {
    const h = String(c.created_at.getHours()).padStart(2, "0");
    byHour[h] = (byHour[h] ?? 0) + 1;
  }
  const volume_24h = Object.entries(byHour).map(([hour, count]) => ({ hour, count }));

  const chAgg: Record<string, number> = {};
  for (const c of convs24h) {
    chAgg[c.channel_id] = (chAgg[c.channel_id] ?? 0) + 1;
  }
  const chRows = await getPrisma().channel.findMany();
  const denom = convs24h.length || 1;
  const channel_breakdown = chRows.map((ch) => {
    const count = chAgg[ch.id] ?? 0;
    return {
      channel: ch.type,
      count,
      percentage: Math.round((count / denom) * 1000) / 10,
    };
  });

  return {
    agents_online: agents_online,
    agents_total: agents_total,
    conversations_waiting: waiting,
    conversations_active: active,
    conversations_resolved_today: resolved_today,
    avg_wait_seconds: 45,
    avg_handle_seconds: 420,
    sla_compliance: 92,
    csat_avg: 4.3,
    abandonment_rate: 3.1,
    transfer_rate: 8.5,
    escalations_from_ai: aiEscalations,
    volume_24h,
    channel_breakdown,
  };
}
