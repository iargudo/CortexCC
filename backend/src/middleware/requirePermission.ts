import type { NextFunction, Request, Response } from "express";
import { hasPermission, type PermissionKey } from "../lib/permissions.js";
import { HttpError } from "./errorHandler.js";

function userHasRoleName(req: Request, roleName: string): boolean {
  return Boolean(req.authUser?.roles.some((r) => r.name === roleName));
}

function mergedPermissions(req: Request): Record<string, boolean> {
  const merged: Record<string, boolean> = {};
  for (const r of req.authUser?.roles ?? []) {
    const p = r.permissions as Record<string, boolean> | null;
    if (p && typeof p === "object") {
      for (const [k, v] of Object.entries(p)) {
        if (v) merged[k] = true;
      }
    }
  }
  return merged;
}

export function requirePermission(key: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser) throw new HttpError(401, "Unauthorized");
    if (userHasRoleName(req, "admin")) return next();
    if (hasPermission(mergedPermissions(req), key)) return next();
    throw new HttpError(403, "Forbidden");
  };
}

export function requireAnyPermission(...keys: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser) throw new HttpError(401, "Unauthorized");
    if (userHasRoleName(req, "admin")) return next();
    const merged = mergedPermissions(req);
    for (const key of keys) {
      if (hasPermission(merged, key)) return next();
    }
    throw new HttpError(403, "Forbidden");
  };
}
