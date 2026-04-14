import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";

function weightedScore(c: { saludo: number; empatia: number; resolucion: number; cierre: number }) {
  return c.saludo * 0.25 + c.empatia * 0.25 + c.resolucion * 0.3 + c.cierre * 0.2;
}

export async function listPending() {
  return prisma.conversation.findMany({
    where: { status: "RESOLVED" },
    orderBy: { resolved_at: "desc" },
    take: 50,
    include: {
      contact: true,
      channel: true,
      assignments: { where: { ended_at: { not: null } }, take: 1, include: { user: true } },
    },
  });
}

export async function listEvaluations() {
  return prisma.qualityEvaluation.findMany({ orderBy: { created_at: "desc" }, take: 100 });
}

export async function createEvaluation(input: {
  conversation_id: string;
  categories: { saludo: number; empatia: number; resolucion: number; cierre: number };
  comment: string;
  evaluatorId?: string;
}) {
  const conv = await prisma.conversation.findUnique({
    where: { id: input.conversation_id },
    include: { contact: true, channel: true, assignments: { include: { user: true } } },
  });
  if (!conv) throw new HttpError(404, "Conversation not found");
  const agent = conv.assignments[0]?.user;
  const score = weightedScore(input.categories) * 10;
  return prisma.qualityEvaluation.create({
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
