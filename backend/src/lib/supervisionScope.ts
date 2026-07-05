import type { AuthUserPayload } from "../middleware/auth.js";

/**
 * Supervision scope derived from RBAC roles + team coordination:
 * - admin / supervisor → global (jefatura): sees everything, moves across teams.
 * - coordinator → scoped to the teams it coordinates (coordinatorTeamIds).
 * - anyone else → not a supervisor.
 *
 * The `coordinator` role grants supervision capabilities; the team scope comes
 * from TeamMember.role='coordinator' (loaded as coordinatorTeamIds). Both are
 * complementary: the role gives the "what", the membership gives the "where".
 */
export interface SupervisionScope {
  /** Has elevated (supervisor/admin/coordinator) access. */
  isSupervisor: boolean;
  /** Sees everything and can move across teams. */
  global: boolean;
  /** When not global, the teams this coordinator is limited to. */
  teamIds: string[];
}

export function getSupervisionScope(user: AuthUserPayload | undefined): SupervisionScope {
  const roles = user?.roles ?? [];
  const isAdmin = roles.some((r) => r.name === "admin");
  const isGlobalSupervisor = isAdmin || roles.some((r) => r.name === "supervisor");
  const isCoordinator = roles.some((r) => r.name === "coordinator");

  if (isGlobalSupervisor) {
    return { isSupervisor: true, global: true, teamIds: [] };
  }
  if (isCoordinator) {
    // Acotado a los equipos que coordina (vacío = no ve nada hasta asignarlo).
    return { isSupervisor: true, global: false, teamIds: user?.coordinatorTeamIds ?? [] };
  }
  return { isSupervisor: false, global: false, teamIds: [] };
}

/** teamIds to pass to services: null = global (no filter), array = scoped. */
export function scopeTeamIds(scope: SupervisionScope): string[] | null {
  return scope.global ? null : scope.teamIds;
}
