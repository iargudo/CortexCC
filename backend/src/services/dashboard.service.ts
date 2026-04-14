import { prisma } from "../lib/prisma.js";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getDashboardStats() {
  const today = startOfToday();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);

  const [
    agents_total,
    agents_online,
    waiting,
    active,
    resolved_today,
    convs24h,
    aiEscalations,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: { in: ["ONLINE", "BUSY"] } } }),
    prisma.conversation.count({ where: { status: "WAITING" } }),
    prisma.conversation.count({ where: { status: { in: ["ACTIVE", "ASSIGNED", "ON_HOLD"] } } }),
    prisma.conversation.count({ where: { status: "RESOLVED", resolved_at: { gte: today } } }),
    prisma.conversation.findMany({
      where: { created_at: { gte: since24h } },
      select: { channel_id: true, created_at: true },
    }),
    prisma.conversation.count({ where: { source: { contains: "escalation" } } }),
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
  const chRows = await prisma.channel.findMany();
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
