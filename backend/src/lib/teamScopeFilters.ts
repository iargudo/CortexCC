import type { Prisma } from "@prisma/client";

/**
 * Convención de alcance por equipo (igual que dashboard/live-board):
 * - `null` / `undefined` → global (admin/supervisor jefatura)
 * - `string[]` (incluso vacío) → coordinador acotado a esos equipos
 */
export function isTeamScoped(teamIds?: string[] | null): teamIds is string[] {
  return Array.isArray(teamIds);
}

export function conversationTeamFilter(
  teamIds?: string[] | null
): Prisma.ConversationWhereInput {
  if (!isTeamScoped(teamIds)) return {};
  return { queue: { team_id: { in: teamIds } } };
}

export function userTeamFilter(teamIds?: string[] | null): Prisma.UserWhereInput {
  if (!isTeamScoped(teamIds)) return {};
  return { teams: { some: { team_id: { in: teamIds } } } };
}

export function queueTeamFilter(teamIds?: string[] | null): Prisma.QueueWhereInput {
  if (!isTeamScoped(teamIds)) return {};
  return { team_id: { in: teamIds } };
}

export function qualityEvaluationTeamFilter(
  teamIds?: string[] | null
): Prisma.QualityEvaluationWhereInput {
  if (!isTeamScoped(teamIds)) return {};
  return { conversation: { queue: { team_id: { in: teamIds } } } };
}

export function voiceCallTeamFilter(teamIds?: string[] | null): Prisma.VoiceCallWhereInput {
  if (!isTeamScoped(teamIds)) return {};
  return {
    OR: [
      { conversation: { queue: { team_id: { in: teamIds } } } },
      { user: { teams: { some: { team_id: { in: teamIds } } } } },
    ],
  };
}
