import { Router } from "express";
import { resolveByHost, getTenantInfo } from "../lib/tenantConnectionManager.js";
import { getCurrentTenantKey, getCurrentTenantName } from "../lib/tenantContext.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authMiddleware, requireAuth } from "../middleware/auth.js";

export function buildTenantsRouter(): Router {
  const r = Router();

  r.get(
    "/resolve",
    asyncHandler(async (req, res) => {
      const host = typeof req.query.host === "string" ? req.query.host.trim() : "";
      if (!host) {
        return res.status(400).json({ error: "host query parameter is required" });
      }
      const resolved = await resolveByHost(host);
      if (!resolved) {
        return res.status(404).json({ error: "Domain not configured" });
      }
      return res.json({ key: resolved.key, name: resolved.name });
    })
  );

  r.get(
    "/current",
    authMiddleware,
    requireAuth,
    asyncHandler(async (_req, res) => {
      const key = getCurrentTenantKey();
      const name = getCurrentTenantName();
      const cached = getTenantInfo(key);
      return res.json({ key, name: cached?.name ?? name });
    })
  );

  return r;
}
