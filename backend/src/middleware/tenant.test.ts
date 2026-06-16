import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { tenantMiddleware } from "./tenant.js";

vi.mock("../lib/tenantConnectionManager.js", () => ({
  ensureConnection: vi.fn(async (key: string) => ({ key, name: `Tenant ${key}` })),
}));

describe("tenantMiddleware", () => {
  it("allows GET /health without tenant header", async () => {
    const req = { method: "GET", path: "/health", headers: {} } as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await tenantMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows WhatsApp webhook without X-Tenant-Key header", async () => {
    const req = {
      method: "POST",
      path: "/webhooks/local/whatsapp/chan-1",
      headers: {},
    } as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await tenantMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 when X-Tenant-Key is missing", async () => {
    const req = { method: "GET", path: "/conversations", headers: {} } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await tenantMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing X-Tenant-Key header" });
    expect(next).not.toHaveBeenCalled();
  });
});
