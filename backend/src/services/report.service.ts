import { prisma } from "../lib/prisma.js";

export async function volumeReport(dateFrom: Date, dateTo: Date) {
  const rows = await prisma.conversation.findMany({
    where: { created_at: { gte: dateFrom, lte: dateTo } },
    include: { channel: true },
  });
  const byDay: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const day = r.created_at.toISOString().slice(0, 10);
    byDay[day] ??= {};
    byDay[day][r.channel.type] = (byDay[day][r.channel.type] ?? 0) + 1;
  }
  return { byDay };
}

function startOfWeekUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
  return x;
}

export async function summaryKpis(dateFrom: Date, dateTo: Date) {
  const range = { gte: dateFrom, lte: dateTo };
  const [total, resolved, abandoned, ahtAgg, convCsatAgg, resolvedSlaOk, resolvedSlaBad] =
    await Promise.all([
      prisma.conversation.count({ where: { created_at: range } }),
      prisma.conversation.count({ where: { created_at: range, status: "RESOLVED" } }),
      prisma.conversation.count({ where: { created_at: range, status: "ABANDONED" } }),
      prisma.conversation.aggregate({
        where: { created_at: range, handle_time_seconds: { not: null } },
        _avg: { handle_time_seconds: true },
      }),
      prisma.conversation.aggregate({
        where: { created_at: range, csat_score: { not: null } },
        _avg: { csat_score: true },
      }),
      prisma.conversation.count({
        where: { created_at: range, status: "RESOLVED", sla_breached: false },
      }),
      prisma.conversation.count({
        where: { created_at: range, status: "RESOLVED", sla_breached: true },
      }),
    ]);
  const slaResolved = resolvedSlaOk + resolvedSlaBad;
  const sla_met_percent = slaResolved > 0 ? Math.round((resolvedSlaOk / slaResolved) * 100) : 100;
  return {
    total_conversations: total,
    resolved,
    abandoned,
    avg_aht_seconds: Math.round(ahtAgg._avg.handle_time_seconds ?? 0),
    avg_csat: convCsatAgg._avg.csat_score != null ? Number(convCsatAgg._avg.csat_score.toFixed(2)) : 0,
    sla_met_percent,
  };
}

export async function hourlyVolumeReport(dateFrom: Date, dateTo: Date) {
  const rows = await prisma.conversation.findMany({
    where: { created_at: { gte: dateFrom, lte: dateTo } },
    select: { created_at: true },
  });
  const counts = new Array(24).fill(0) as number[];
  for (const r of rows) {
    const h = r.created_at.getHours();
    counts[h] += 1;
  }
  return {
    byHour: counts.map((conversations, h) => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      conversations,
    })),
  };
}

export async function csatTrendReport(dateFrom: Date, dateTo: Date) {
  const range = { gte: dateFrom, lte: dateTo };
  const [evals, convRatings] = await Promise.all([
    prisma.qualityEvaluation.findMany({
      where: { created_at: range },
      select: { score: true, created_at: true },
    }),
    prisma.conversation.findMany({
      where: { updated_at: range, csat_score: { not: null } },
      select: { csat_score: true, updated_at: true },
    }),
  ]);

  const weekMap = new Map<string, { sum: number; n: number }>();
  const add = (d: Date, score: number) => {
    const w = startOfWeekUtc(d);
    const key = w.toISOString().slice(0, 10);
    const cur = weekMap.get(key) ?? { sum: 0, n: 0 };
    cur.sum += score;
    cur.n += 1;
    weekMap.set(key, cur);
  };
  for (const e of evals) add(e.created_at, e.score);
  for (const c of convRatings) {
    if (c.csat_score != null) add(c.updated_at, c.csat_score);
  }

  const byWeek = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, { sum, n }]) => ({
      week: weekStart,
      label: new Date(weekStart).toLocaleDateString("es", { day: "2-digit", month: "short" }),
      avg_score: n > 0 ? Number((sum / n).toFixed(2)) : 0,
      samples: n,
    }));

  return { byWeek };
}

export async function productivityReport(dateFrom: Date, dateTo: Date) {
  const range = { gte: dateFrom, lte: dateTo };
  const users = await prisma.user.findMany({
    include: {
      assignments: {
        where: { assigned_at: range },
        include: {
          conversation: {
            select: {
              id: true,
              status: true,
              handle_time_seconds: true,
              csat_score: true,
            },
          },
        },
      },
    },
  });

  return users.map((u) => {
    const convIds = new Set<string>();
    let handleSum = 0;
    let handleN = 0;
    let csatSum = 0;
    let csatN = 0;
    for (const a of u.assignments) {
      const c = a.conversation;
      convIds.add(c.id);
      if (c.handle_time_seconds != null && (c.status === "RESOLVED" || c.status === "WRAP_UP")) {
        handleSum += c.handle_time_seconds;
        handleN += 1;
      }
      if (c.csat_score != null) {
        csatSum += c.csat_score;
        csatN += 1;
      }
    }
    const aht_seconds = handleN > 0 ? Math.round(handleSum / handleN) : 0;
    const csat = csatN > 0 ? Number((csatSum / csatN).toFixed(2)) : 0;
    const fcr =
      u.assignments.length > 0
        ? Math.min(
            100,
            Math.round(
              (u.assignments.filter((a) => a.conversation.status === "RESOLVED").length /
                u.assignments.length) *
                100
            )
          )
        : 0;
    return {
      agent: `${u.first_name} ${u.last_name}`,
      conversations: convIds.size,
      aht_seconds,
      csat,
      fcr,
      status: u.status,
    };
  });
}

export async function slaReport(dateFrom: Date, dateTo: Date) {
  const range = { gte: dateFrom, lte: dateTo };
  const queues = await prisma.queue.findMany({ select: { id: true, name: true, max_wait_seconds: true } });
  const rows = await prisma.conversation.groupBy({
    by: ["queue_id", "sla_breached"],
    where: {
      created_at: range,
      queue_id: { not: null },
      status: { in: ["RESOLVED", "WRAP_UP"] },
    },
    _count: true,
  });
  const waitAgg = await prisma.conversation.groupBy({
    by: ["queue_id"],
    where: { created_at: range, queue_id: { not: null }, wait_time_seconds: { not: null } },
    _avg: { wait_time_seconds: true },
  });
  const waitMap = new Map(waitAgg.map((w) => [w.queue_id!, Math.round(w._avg.wait_time_seconds ?? 0)]));

  const map = new Map<string, { ok: number; bad: number }>();
  for (const r of rows) {
    if (!r.queue_id) continue;
    const cur = map.get(r.queue_id) ?? { ok: 0, bad: 0 };
    if (r.sla_breached) cur.bad += r._count;
    else cur.ok += r._count;
    map.set(r.queue_id, cur);
  }

  return queues.map((q) => {
    const c = map.get(q.id) ?? { ok: 0, bad: 0 };
    const handled = c.ok + c.bad;
    const sla_percent = handled > 0 ? Math.round((c.ok / handled) * 100) : 100;
    return {
      queue: q.name,
      handled,
      sla_percent,
      avg_wait: waitMap.get(q.id) ?? q.max_wait_seconds,
    };
  });
}

function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV UTF-8 para exportar desde la UI de reportes. */
export async function exportReportCsv(
  type: string,
  dateFrom: Date,
  dateTo: Date
): Promise<{ filename: string; body: string }> {
  const t = type.toLowerCase();
  if (t === "productivity") {
    const rows = await productivityReport(dateFrom, dateTo);
    const lines = [["agent", "conversations", "aht_seconds", "csat", "fcr", "status"].join(",")];
    for (const r of rows) {
      lines.push(
        [r.agent, r.conversations, r.aht_seconds, r.csat, r.fcr, r.status].map(csvCell).join(",")
      );
    }
    return { filename: "productividad.csv", body: lines.join("\n") };
  }
  if (t === "sla") {
    const rows = await slaReport(dateFrom, dateTo);
    const lines = [["queue", "handled", "sla_percent", "avg_wait_seconds"].join(",")];
    for (const r of rows) {
      lines.push([r.queue, r.handled, r.sla_percent, r.avg_wait].map(csvCell).join(","));
    }
    return { filename: "sla-por-cola.csv", body: lines.join("\n") };
  }
  if (t === "summary") {
    const s = await summaryKpis(dateFrom, dateTo);
    const lines = [
      ["metric", "value"].join(","),
      ["total_conversations", s.total_conversations].map(csvCell).join(","),
      ["resolved", s.resolved].map(csvCell).join(","),
      ["abandoned", s.abandoned].map(csvCell).join(","),
      ["avg_aht_seconds", s.avg_aht_seconds].map(csvCell).join(","),
      ["avg_csat", s.avg_csat].map(csvCell).join(","),
      ["sla_met_percent", s.sla_met_percent].map(csvCell).join(","),
    ];
    return { filename: "resumen-kpis.csv", body: lines.join("\n") };
  }
  if (t === "hourly") {
    const h = await hourlyVolumeReport(dateFrom, dateTo);
    const lines = [["hour", "conversations"].join(",")];
    for (const row of h.byHour) {
      lines.push([row.hour, row.conversations].map(csvCell).join(","));
    }
    return { filename: "volumen-horario.csv", body: lines.join("\n") };
  }
  if (t === "csat") {
    const c = await csatTrendReport(dateFrom, dateTo);
    const lines = [["week_start", "label", "avg_score", "samples"].join(",")];
    for (const row of c.byWeek) {
      lines.push([row.week, row.label, row.avg_score, row.samples].map(csvCell).join(","));
    }
    return { filename: "csat-semanal.csv", body: lines.join("\n") };
  }
  const vol = await volumeReport(dateFrom, dateTo);
  const lines = [["day", "channel", "conversations"].join(",")];
  for (const [day, chMap] of Object.entries(vol.byDay)) {
    for (const [channel, count] of Object.entries(chMap)) {
      lines.push([day, channel, count].map(csvCell).join(","));
    }
  }
  return { filename: "volumen-diario.csv", body: lines.join("\n") };
}
