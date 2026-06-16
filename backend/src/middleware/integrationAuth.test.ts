import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { integrationApiKeyMiddleware } from "./integrationAuth.js";
import { env } from "../config/env.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

describe("integrationApiKeyMiddleware", () => {
  it("allows requests with valid x-api-key header", () => {
    const req = {
      headers: { "x-api-key": env.INTEGRATION_API_KEY },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    integrationApiKeyMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it("rejects missing API key", () => {
    const req = { headers: {} } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    integrationApiKeyMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid API key" });
  });

  it("rejects invalid API key", () => {
    const req = { headers: { "x-api-key": "wrong-key" } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    integrationApiKeyMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
