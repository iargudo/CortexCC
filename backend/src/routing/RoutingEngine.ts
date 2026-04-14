import type { ConversationStatus, Prisma, PrismaClient, RoutingStrategy } from "@prisma/client";
import { assignLock, releaseAssignLock } from "../lib/redis.js";
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
  priorityScore: number;
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

      const eligible = await this.getEligibleAgents(conversation.queue);
      if (eligible.length === 0) {
        await this.emitQueueUpdated(conversation.queue_id);
        return;
      }

      const ranked = rankAgentsByStrategy(eligible, conversation.queue.routing_strategy);
      const pick = ranked[0];
      await this.assignToAgent(conversation.id, pick.userId, conversation.queue_id);
    } finally {
      await releaseAssignLock(conversationId);
    }
  }

  private async getEligibleAgents(queue: QueueWithRelations): Promise<AgentScore[]> {
    const teamUserIds = queue.team?.members.map((m) => m.user_id) ?? null;

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

      scores.push({
        userId: u.id,
        activeCount: u.assignments.length,
        lastAssignedAt: lastAssignment?.assigned_at ?? null,
        lastEndedAt: lastResolved?.ended_at ?? null,
        skillScore,
        priorityScore: u.status === "ONLINE" ? 2 : 1,
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

    this.io?.to(`user:${agentUserId}`).emit("conversation:assigned", {
      conversationId,
      contact_name: full?.contact?.name,
      channel: full?.channel.type,
      queue: full?.queue?.name,
    });
    this.io?.to(`user:${agentUserId}`).emit("notification:new", {
      type: "NEW_ASSIGNMENT",
      conversation_id: conversationId,
      data: {
        contact_name: full?.contact?.name,
        channel: full?.channel.type,
        queue: full?.queue?.name,
      },
      timestamp: new Date().toISOString(),
    });
    this.io?.emit("supervisor:live_update", { type: "assign", conversationId, queueId });
    await this.emitQueueUpdated(queueId);
  }

  private async emitQueueUpdated(queueId: string): Promise<void> {
    this.io?.to(`queue:${queueId}`).emit("queue:updated", { queueId });
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
    const eligible = await this.getEligibleAgents(queue);
    if (!eligible.length) return null;
    return rankAgentsByStrategy(eligible, strategy)[0]?.userId ?? null;
  }
}
