import { getPrisma } from "./prisma.js";
import { hasPermission, type PermissionKey } from "./permissions.js";
import { getSupervisionScope } from "./supervisionScope.js";
import type { AuthUserPayload } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

function mergedRolePermissions(user: AuthUserPayload): Record<string, boolean> {
  const merged: Record<string, boolean> = {};
  for (const r of user.roles ?? []) {
    const p = r.permissions as Record<string, boolean> | null;
    if (p && typeof p === "object") {
      for (const [k, v] of Object.entries(p)) {
        if (v) merged[k] = true;
      }
    }
  }
  return merged;
}

/** Admin / supervisor / coordinador (o permiso supervisor) siempre pueden transferir. */
export function isTransferElevated(user: AuthUserPayload | undefined): boolean {
  if (!user) return false;
  if (getSupervisionScope(user).isSupervisor) return true;
  return hasPermission(mergedRolePermissions(user), "supervisor" as PermissionKey);
}

export async function getAgentCanTransferSetting(): Promise<boolean> {
  const org = await getPrisma().organizationSettings.findUnique({
    where: { id: "default" },
    select: { agent_can_transfer: true },
  });
  return Boolean(org?.agent_can_transfer);
}

/** True si el usuario puede transferir conversaciones según rol/alcance u org setting. */
export async function userCanTransferConversations(user: AuthUserPayload | undefined): Promise<boolean> {
  if (!user) return false;
  if (isTransferElevated(user)) return true;
  return getAgentCanTransferSetting();
}

export async function assertUserCanTransferConversations(user: AuthUserPayload | undefined): Promise<void> {
  if (!user) throw new HttpError(401, "Unauthorized");
  if (await userCanTransferConversations(user)) return;
  throw new HttpError(403, "La transferencia de conversaciones está deshabilitada para agentes.");
}
