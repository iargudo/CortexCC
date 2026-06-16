import type { NextFunction, Request, Response } from "express";
import { ensureConnection } from "../lib/tenantConnectionManager.js";
import { runWithTenant } from "../lib/tenantContext.js";
import { HttpError } from "./errorHandler.js";

const TENANT_HEADER = "x-tenant-key";

function isTenantExemptPath(req: Request): boolean {
  const path = req.path;
  if (req.method === "GET" && (path === "/health" || path === "/tenants/resolve")) {
    return true;
  }
  return false;
}

function tenantKeyFromWebhookPath(req: Request): string | null {
  const match = req.path.match(/^\/webhooks\/([^/]+)\/whatsapp\/[^/]+$/);
  return match?.[1] ?? null;
}

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isTenantExemptPath(req)) {
    return next();
  }

  const webhookTenantKey = tenantKeyFromWebhookPath(req);
  const tenantKey = webhookTenantKey ?? (req.headers[TENANT_HEADER] as string | undefined)?.trim();

  if (!tenantKey) {
    return res.status(400).json({ error: "Missing X-Tenant-Key header" });
  }

  try {
    const info = await ensureConnection(tenantKey);
    return runWithTenant(info.key, info.name, () => {
      next();
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("[tenant] middleware error:", err);
    return res.status(500).json({ error: "Tenant connection failed" });
  }
}

export function getRequestTenantKey(req: Request): string | undefined {
  const webhookTenantKey = tenantKeyFromWebhookPath(req);
  if (webhookTenantKey) return webhookTenantKey;
  const header = req.headers[TENANT_HEADER] as string | undefined;
  return header?.trim();
}
