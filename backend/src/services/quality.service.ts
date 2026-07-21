import { getPrisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import {
  conversationTeamFilter,
  isTeamScoped,
  qualityEvaluationTeamFilter,
} from "../lib/teamScopeFilters.js";

function weightedScore(c: { saludo: number; empatia: number; resolucion: number; cierre: number }) {
  return c.saludo * 0.25 + c.empatia * 0.25 + c.resolucion * 0.3 + c.cierre * 0.2;
}

export async function listPending(teamIds?: string[] | null) {
  return getPrisma().conversation.findMany({
    where: { status: "RESOLVED", ...conversationTeamFilter(teamIds) },
    orderBy: { resolved_at: "desc" },
    take: 50,
    include: {
      contact: true,
      channel: true,
      assignments: { where: { ended_at: { not: null } }, take: 1, include: { user: true } },
      voice_calls: { orderBy: { created_at: "desc" }, take: 1 },
    },
  });
}

export async function listEvaluations(teamIds?: string[] | null) {
  return getPrisma().qualityEvaluation.findMany({
    where: qualityEvaluationTeamFilter(teamIds),
    orderBy: { created_at: "desc" },
    take: 100,
  });
}

export async function createEvaluation(input: {
  conversation_id: string;
  categories: { saludo: number; empatia: number; resolucion: number; cierre: number };
  comment: string;
  evaluatorId?: string;
  teamIds?: string[] | null;
}) {
  const conv = await getPrisma().conversation.findFirst({
    where: {
      id: input.conversation_id,
      ...conversationTeamFilter(input.teamIds),
    },
    include: { contact: true, channel: true, assignments: { include: { user: true } } },
  });
  if (!conv) {
    if (isTeamScoped(input.teamIds)) {
      const exists = await getPrisma().conversation.findUnique({
        where: { id: input.conversation_id },
        select: { id: true },
      });
      if (exists) throw new HttpError(403, "Conversación fuera del alcance de tu coordinación");
    }
    throw new HttpError(404, "Conversation not found");
  }
  const agent = conv.assignments[0]?.user;
  const score = weightedScore(input.categories) * 10;
  return getPrisma().qualityEvaluation.create({
    data: {
      conversation_id: conv.id,
      evaluator_id: input.evaluatorId,
      agent_display_name: agent ? `${agent.first_name} ${agent.last_name}` : "Unknown",
      contact_display_name: conv.contact.name ?? "Contact",
      channel: conv.channel.type,
      score,
      saludo: input.categories.saludo,
      empatia: input.categories.empatia,
      resolucion: input.categories.resolucion,
      cierre: input.categories.cierre,
      comment: input.comment,
    },
  });
}
