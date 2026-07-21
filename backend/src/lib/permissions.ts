export type PermissionKey =
  | "inbox"
  | "dashboard"
  | "supervisor"
  | "quality"
  | "reports"
  | "contacts"
  | "settings";

export type PermissionsMap = Partial<Record<PermissionKey, boolean>>;

export function hasPermission(permissions: unknown, key: PermissionKey): boolean {
  if (!permissions || typeof permissions !== "object") return false;
  const p = permissions as Record<string, boolean>;
  return Boolean(p[key]);
}

export const defaultRolePermissions: Record<string, PermissionsMap> = {
  admin: {
    inbox: true,
    dashboard: true,
    supervisor: true,
    quality: true,
    reports: true,
    contacts: true,
    settings: true,
  },
  supervisor: {
    inbox: true,
    dashboard: true,
    supervisor: true,
    quality: true,
    reports: true,
    contacts: true,
    settings: false,
  },
  // Coordinador: capacidades de supervisión pero acotadas por equipo (ver
  // supervisionScope) y sin acceso a Configuración global.
  coordinator: {
    inbox: true,
    dashboard: true,
    supervisor: true,
    quality: true,
    reports: true,
    contacts: true,
    settings: false,
  },
  agent: {
    inbox: true,
    dashboard: true,
    supervisor: false,
    quality: false,
    reports: false,
    contacts: true,
    settings: false,
  },
};

/**
 * Combina defaults del rol canónico con lo persistido en BD.
 * Las claves explícitas en BD ganan; las nuevas se rellenan sin exigir migración.
 */
export function resolveRolePermissions(roleName: string, stored: unknown): PermissionsMap {
  const defaults = defaultRolePermissions[roleName] ?? {};
  const current =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as PermissionsMap)
      : {};
  return { ...defaults, ...current };
}
