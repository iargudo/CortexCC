import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireAnyPermission } from "./requirePermission.js";
import { HttpError } from "./errorHandler.js";

function authReq(
  roles: { name: string; permissions: Record<string, boolean> }[]
): Request {
  return {
    authUser: {
      id: "u1",
      email: "t@test.local",
      first_name: "T",
      last_name: "U",
      avatar_url: null,
      status: "ONLINE",
      max_concurrent: 3,
      roles,
    },
  } as Request;
}

describe("requireAnyPermission", () => {
  const res = {} as Response;

  it("calls next for admin regardless of flags", () => {
    const mw = requireAnyPermission("settings", "supervisor");
    const next = vi.fn();
    mw(authReq([{ name: "admin", permissions: {} }]), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("calls next when supervisor permission is set", () => {
    const mw = requireAnyPermission("settings", "supervisor");
    const next = vi.fn();
    mw(
      authReq([{ name: "supervisor", permissions: { supervisor: true, settings: false } }]),
      res,
      next
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("calls next when settings permission is set", () => {
    const mw = requireAnyPermission("settings", "supervisor");
    const next = vi.fn();
    mw(authReq([{ name: "custom", permissions: { settings: true } }]), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("throws 403 when neither permission is set", () => {
    const mw = requireAnyPermission("settings", "supervisor");
    const next = vi.fn();
    expect(() =>
      mw(authReq([{ name: "agent", permissions: { inbox: true } }]), res, next)
    ).toThrow(HttpError);
    expect(next).not.toHaveBeenCalled();
  });
});
