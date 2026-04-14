import type { Request } from "express";

export function routeParam(req: Request, key: string): string {
  const v = req.params[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ? String(v) : "";
}
