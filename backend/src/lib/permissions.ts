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
