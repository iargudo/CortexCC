import type { ConversationStatus, Prisma, PrismaClient, RoutingStrategy } from "@prisma/client";
import { assignLock, releaseAssignLock } from "../lib/redis.js";
import { queueRoom, supervisorRoom, userRoom } from "../lib/socketRooms.js";
import { getCurrentTenantKey } from "../lib/tenantContext.js";
import { env } from "../config/env.js";
import type { Server as SocketIOServer } from "socket.io";

type QueueWithRelations = Prisma.QueueGetPayload<{
  include: { skills_required: { include: { skill: true } }; team: { include: { members: true } } };
}>;

export interface AgentScore {
  userId: string;
  activeCount: number;
  lastAssignedAt: Date | null;
  lastEndedAt: Date | null;
  skillScore: number;
  /** For PRIORITY_BASED: agent conversion rate (0..1), Laplace-smoothed. */
  priorityScore: number;
}

/**
 * Conversion rate with Laplace smoothing so agents without history are not
 * stuck at 0 nor dominate with a perfect-but-tiny sample.
 */
export function conversionScore(salesWon: number, salesTotal: number): number {
  return (salesWon + 1) / (salesTotal + 2);
}

export interface CreditedAssignmentRow {
  user_id: string;
  conversation_id: string;
  is_conversion: boolean;
}

/**
 * Aggregates credited (resolved + disposed) assignment rows into per-agent
 * win/total counts, deduping by (user, conversation) so multiple assignments to
 * the same conversation are counted once — matching how `resolveConversation`
 * credits each agent a single time per resolve.
 */
export function aggregateConversionStats(
  rows: CreditedAssignmentRow[]
): Map<string, { won: number; total: number }> {
  const stats = new Map<string, { won: number; total: number }>();
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.user_id}:${r.conversation_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cur = stats.get(r.user_id) ?? { won: 0, total: 0 };
    cur.total += 1;
    if (r.is_conversion) cur.won += 1;
    stats.set(r.user_id, cur);
  }
  return stats;
}

export function rankAgentsByStrategy(agents: AgentScore[], strategy: RoutingStrategy): AgentScore[] {
  const copy = [...agents];
  switch (strategy) {
    case "LEAST_BUSY":
      return copy.sort(
        (a, b) =>
          a.activeCount - b.activeCount ||
          b.skillScore - a.skillScore ||
          (a.lastAssignedAt?.getTime() ?? 0) - (b.lastAssignedAt?.getTime() ?? 0)
      );
    case "SKILL_BASED":
      return copy.sort((a, b) => b.skillScore - a.skillScore || a.activeCount - b.activeCount);
    case "LONGEST_IDLE":
      return copy.sort((a, b) => {
        const ta = a.lastEndedAt?.getTime() ?? 0;
        const tb = b.lastEndedAt?.getTime() ?? 0;
        return ta - tb;
      });
    case "PRIORITY_BASED":
      return copy.sort(
        (a, b) => b.priorityScore - a.priorityScore || a.activeCount - b.activeCount || b.skillScore - a.skillScore
      );
    case "ROUND_ROBIN":
    default:
      return copy.sort(
        (a, b) =>
          (a.lastAssignedAt?.getTime() ?? 0) - (b.lastAssignedAt?.getTime() ?? 0) ||
          a.activeCount - b.activeCount
      );
  }
}

export class RoutingEngine {
  constructor(
    private prisma: PrismaClient,
    private io: SocketIOServer | null
  ) {}

  async routeConversation(conversationId: string): Promise<void> {
    const locked = await assignLock(conversationId, 5);
    if (!locked) return;

    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          channel: true,
          queue: {
            include: {
              skills_required: { include: { skill: true } },
              team: { include: { members: true } } },
          },
        },
      });

      if (!conversation?.queue_id || !conversation.queue) {
        return;
      }

      if (conversation.status !== "WAITING" && conversation.status !== "ASSIGNED") {
        return;
      }

      const eligible = await this.getEligibleAgents(
        conversation.queue,
        conversation.queue.routing_strategy
      );
      const voiceFiltered =
        conversation.channel?.type === "VOICE"
          ? (
              await this.prisma.user.findMany({
                where: {
                  id: { in: eligible.map((e) => e.userId) },
                  sip_extension: { not: null },
                },
                select: { id: true },
              })
            ).map((u) => u.id)
          : null;
      const filteredEligible =
        voiceFiltered != null ? eligible.filter((e) => voiceFiltered.includes(e.userId)) : eligible;
      if (filteredEligible.length === 0) {
        await this.emitQueueUpdated(conversation.queue_id);
        return;
      }

      const ranked = rankAgentsByStrategy(filteredEligible, conversation.queue.routing_strategy);
      const pick = ranked[0];
      await this.assignToAgent(conversation.id, pick.userId, conversation.queue_id);
    } finally {
      await releaseAssignLock(conversationId);
    }
  }

  /**
   * Conversion stats per agent within a recent time window, credited the same way
   * as `resolveConversation`: one resolved conversation (with disposition) per
   * agent that held an assignment on it. Used by PRIORITY_BASED so routing
   * reflects recent performance instead of lifetime totals.
   */
  private async getRecentConversionStats(
    userIds: string[],
    windowStart: Date
  ): Promise<Map<string, { won: number; total: number }>> {
    if (userIds.length === 0) return new Map();

    const assignments = await this.prisma.conversationAssignment.findMany({
      where: {
        user_id: { in: userIds },
        ended_at: { not: null },
        conversation: {
          status: "RESOLVED",
          resolved_at: { gte: windowStart },
          disposition_id: { not: null },
        },
      },
      select: {
        user_id: true,
        conversation_id: true,
        conversation: { select: { disposition: { select: { is_conversion: true } } } },
      },
    });

    return aggregateConversionStats(
      assignments.map((a) => ({
        user_id: a.user_id,
        conversation_id: a.conversation_id,
        is_conversion: a.conversation.disposition?.is_conversion ?? false,
      }))
    );
  }

  private async getEligibleAgents(
    queue: QueueWithRelations,
    strategy?: RoutingStrategy
  ): Promise<AgentScore[]> {
    // Los coordinadores del equipo supervisan, no reciben conversaciones.
    const teamUserIds =
      queue.team?.members.filter((m) => m.role !== "coordinator").map((m) => m.user_id) ?? null;

    const users = await this.prisma.user.findMany({
      where: {
        status: { in: ["ONLINE", "BUSY"] },
        ...(teamUserIds && teamUserIds.length > 0 ? { id: { in: teamUserIds } } : {}),
      },
      include: {
        skills: { include: { skill: true } },
        assignments: {
          where: { ended_at: null },
        },
      },
    });

    const mandatory = queue.skills_required.filter((s) => s.mandatory);
    const optional = queue.skills_required.filter((s) => !s.mandatory);

    // Solo para PRIORITY_BASED calculamos la tasa de conversión reciente (batch).
    // Con ventana 0 se usa el histórico acumulado (sales_won/sales_total).
    const windowDays = env.PRIORITY_WINDOW_DAYS;
    const recentStats =
      strategy === "PRIORITY_BASED" && windowDays > 0
        ? await this.getRecentConversionStats(
            users.map((u) => u.id),
            new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
          )
        : null;

    const scores: AgentScore[] = [];

    for (const u of users) {
      if (u.assignments.length >= u.max_concurrent) continue;

      let ok = true;
      for (const req of mandatory) {
        const us = u.skills.find((x) => x.skill_id === req.skill_id);
        if (!us || us.proficiency < req.min_level) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      let skillScore = 0;
      for (const req of [...mandatory, ...optional]) {
        const us = u.skills.find((x) => x.skill_id === req.skill_id);
        if (us) skillScore += us.proficiency;
      }

      const lastAssignment = await this.prisma.conversationAssignment.findFirst({
        where: { user_id: u.id },
        orderBy: { assigned_at: "desc" },
      });

      const lastResolved = await this.prisma.conversationAssignment.findFirst({
        where: { user_id: u.id, ended_at: { not: null } },
        orderBy: { ended_at: "desc" },
      });

      // En modo ventana, un agente sin actividad reciente cuenta como 0/0
      // (score neutro 0.5 por el suavizado de Laplace), no su histórico de por vida.
      const recent = recentStats ? (recentStats.get(u.id) ?? { won: 0, total: 0 }) : null;
      const priorityScore = recent
        ? conversionScore(recent.won, recent.total)
        : conversionScore(u.sales_won, u.sales_total);

      scores.push({
        userId: u.id,
        activeCount: u.assignments.length,
        lastAssignedAt: lastAssignment?.assigned_at ?? null,
        lastEndedAt: lastResolved?.ended_at ?? null,
        skillScore,
        priorityScore,
      });
    }

    return scores;
  }

  private async assignToAgent(
    conversationId: string,
    agentUserId: string,
    queueId: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: conversationId },
        data: { status: "ASSIGNED" as ConversationStatus },
      });
      await tx.conversationAssignment.create({
        data: {
          conversation_id: conversationId,
          user_id: agentUserId,
          reason: "auto_routed",
        },
      });
    });

    const full = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true, channel: true, queue: { select: { name: true } } },
    });

    if (full?.channel.type === "VOICE") {
      const { ringAgentForConversation } = await import("../services/voice/voiceCallController.service.js");
      void ringAgentForConversation(this.io, conversationId, agentUserId).catch((err) => {
        console.error("[voice] Failed to ring agent after assignment:", err);
      });
    }

    const tenantKey = getCurrentTenantKey();
    this.io?.to(userRoom(tenantKey, agentUserId)).emit("conversation:assigned", {
      conversationId,
      contact_name: full?.contact?.name,
      channel: full?.channel.type,
      queue: full?.queue?.name,
    });
    this.io?.to(userRoom(tenantKey, agentUserId)).emit("notification:new", {
      type: "NEW_ASSIGNMENT",
      conversation_id: conversationId,
      data: {
        contact_name: full?.contact?.name,
        channel: full?.channel.type,
        queue: full?.queue?.name,
      },
      timestamp: new Date().toISOString(),
    });
    this.io
      ?.to(supervisorRoom(tenantKey))
      .emit("supervisor:live_update", { type: "assign", conversationId, queueId, tenantKey });
    await this.emitQueueUpdated(queueId);
  }

  private async emitQueueUpdated(queueId: string): Promise<void> {
    const tenantKey = getCurrentTenantKey();
    this.io?.to(queueRoom(tenantKey, queueId)).emit("queue:updated", { queueId });
  }

  async recommendAgent(queueId: string, strategy: RoutingStrategy): Promise<string | null> {
    const queue = await this.prisma.queue.findUnique({
      where: { id: queueId },
      include: {
        skills_required: { include: { skill: true } },
        team: { include: { members: true } },
      },
    });
    if (!queue) return null;
    const eligible = await this.getEligibleAgents(queue, strategy);
    if (!eligible.length) return null;
    return rankAgentsByStrategy(eligible, strategy)[0]?.userId ?? null;
  }
}
