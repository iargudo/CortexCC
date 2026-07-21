import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../middleware/errorHandler.js";
import type { AuthUserPayload } from "../middleware/auth.js";

vi.mock("./prisma.js", () => ({
  getPrisma: vi.fn(),
}));

import { getPrisma } from "./prisma.js";
import {
  assertUserCanTransferConversations,
  isTransferElevated,
  userCanTransferConversations,
} from "./transferPolicy.js";

function user(roles: { name: string; permissions?: Record<string, boolean> }[]): AuthUserPayload {
  return {
    id: "u1",
    email: "t@test.local",
    first_name: "T",
    last_name: "U",
    avatar_url: null,
    status: "ONLINE",
    max_concurrent: 3,
    roles: roles.map((r) => ({ name: r.name, permissions: r.permissions ?? {} })),
  } as AuthUserPayload;
}

describe("isTransferElevated", () => {
  it("treats admin, supervisor and coordinator as elevated", () => {
    expect(isTransferElevated(user([{ name: "admin" }]))).toBe(true);
    expect(isTransferElevated(user([{ name: "supervisor" }]))).toBe(true);
    expect(isTransferElevated(user([{ name: "coordinator" }]))).toBe(true);
  });

  it("treats plain agent as not elevated", () => {
    expect(isTransferElevated(user([{ name: "agent", permissions: { inbox: true } }]))).toBe(false);
  });
});

describe("userCanTransferConversations", () => {
  beforeEach(() => {
    vi.mocked(getPrisma).mockReset();
  });

  it("allows elevated roles without reading org settings", async () => {
    expect(await userCanTransferConversations(user([{ name: "coordinator" }]))).toBe(true);
    expect(getPrisma).not.toHaveBeenCalled();
  });

  it("allows agent when organization setting is enabled", async () => {
    vi.mocked(getPrisma).mockReturnValue({
      organizationSettings: {
        findUnique: vi.fn().mockResolvedValue({ agent_can_transfer: true }),
      },
    } as never);
    expect(
      await userCanTransferConversations(user([{ name: "agent", permissions: { inbox: true } }]))
    ).toBe(true);
  });

  it("blocks agent when organization setting is disabled", async () => {
    vi.mocked(getPrisma).mockReturnValue({
      organizationSettings: {
        findUnique: vi.fn().mockResolvedValue({ agent_can_transfer: false }),
      },
    } as never);
    expect(
      await userCanTransferConversations(user([{ name: "agent", permissions: { inbox: true } }]))
    ).toBe(false);
  });
});

describe("assertUserCanTransferConversations", () => {
  beforeEach(() => {
    vi.mocked(getPrisma).mockReset();
  });

  it("throws 403 for agent when disabled", async () => {
    vi.mocked(getPrisma).mockReturnValue({
      organizationSettings: {
        findUnique: vi.fn().mockResolvedValue({ agent_can_transfer: false }),
      },
    } as never);
    await expect(
      assertUserCanTransferConversations(user([{ name: "agent", permissions: { inbox: true } }]))
    ).rejects.toBeInstanceOf(HttpError);
  });
});
