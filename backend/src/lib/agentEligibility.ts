import type { AgentStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { HttpError } from "../middleware/errorHandler.js";

/** Estados que reciben trabajo nuevo (alineado con RoutingEngine). */
export const ASSIGNABLE_STATUSES: AgentStatus[] = ["ONLINE", "BUSY"];

export type AgentEligibilityCode = "AGENT_STATUS_BLOCKED" | "AGENT_AT_CAPACITY";

export type AgentAssignmentLoad = {
  id: string;
  status: AgentStatus;
  max_concurrent: number;
  active_count: number;
};

export type AgentAssignableResult = AgentAssignmentLoad & {
  forced: boolean;
};

export async function getAgentAssignmentLoad(userId: string): Promise<AgentAssignmentLoad> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      max_concurrent: true,
      assignments: { where: { ended_at: null }, select: { id: true } },
    },
  });
  if (!user) throw new HttpError(404, "Agente destino no encontrado");
  return {
    id: user.id,
    status: user.status,
    max_concurrent: user.max_concurrent,
    active_count: user.assignments.length,
  };
}

export function isAgentStatusAssignable(status: AgentStatus): boolean {
  return ASSIGNABLE_STATUSES.includes(status);
}

/**
 * Valida si un agente puede recibir una asignación manual.
 * Con `force: true` no bloquea; retorna metadata del override.
 */
export async function assertAgentAssignable(
  userId: string,
  opts: { force?: boolean } = {}
): Promise<AgentAssignableResult> {
  const load = await getAgentAssignmentLoad(userId);
  const forced = Boolean(opts.force);

  if (forced) {
    return { ...load, forced: true };
  }

  if (!isAgentStatusAssignable(load.status)) {
    throw new HttpError(409, `El agente no está disponible (estado: ${load.status}).`, {
      code: "AGENT_STATUS_BLOCKED" satisfies AgentEligibilityCode,
      status: load.status,
      active_count: load.active_count,
      max_concurrent: load.max_concurrent,
    });
  }

  if (load.active_count >= load.max_concurrent) {
    throw new HttpError(409, "El agente está a capacidad máxima.", {
      code: "AGENT_AT_CAPACITY" satisfies AgentEligibilityCode,
      status: load.status,
      active_count: load.active_count,
      max_concurrent: load.max_concurrent,
    });
  }

  return { ...load, forced: false };
}
