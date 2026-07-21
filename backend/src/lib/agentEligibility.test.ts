import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../middleware/errorHandler.js";

vi.mock("./prisma.js", () => ({
  getPrisma: vi.fn(),
}));

import { getPrisma } from "./prisma.js";
import { assertAgentAssignable, isAgentStatusAssignable } from "./agentEligibility.js";

describe("isAgentStatusAssignable", () => {
  it("allows ONLINE and BUSY", () => {
    expect(isAgentStatusAssignable("ONLINE")).toBe(true);
    expect(isAgentStatusAssignable("BUSY")).toBe(true);
  });

  it("blocks other statuses", () => {
    expect(isAgentStatusAssignable("AWAY")).toBe(false);
    expect(isAgentStatusAssignable("ON_BREAK")).toBe(false);
    expect(isAgentStatusAssignable("OFFLINE")).toBe(false);
    expect(isAgentStatusAssignable("FOLLOW_UP")).toBe(false);
  });
});

describe("assertAgentAssignable", () => {
  beforeEach(() => {
    vi.mocked(getPrisma).mockReset();
  });

  function mockUser(data: {
    status: string;
    max_concurrent: number;
    active: number;
  }) {
    vi.mocked(getPrisma).mockReturnValue({
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "agent-1",
          status: data.status,
          max_concurrent: data.max_concurrent,
          assignments: Array.from({ length: data.active }, (_, i) => ({ id: `a${i}` })),
        }),
      },
    } as never);
  }

  it("allows ONLINE agent under capacity", async () => {
    mockUser({ status: "ONLINE", max_concurrent: 3, active: 1 });
    const out = await assertAgentAssignable("agent-1");
    expect(out.forced).toBe(false);
    expect(out.active_count).toBe(1);
  });

  it("rejects AWAY without force", async () => {
    mockUser({ status: "AWAY", max_concurrent: 3, active: 0 });
    await expect(assertAgentAssignable("agent-1")).rejects.toMatchObject({
      status: 409,
      details: { code: "AGENT_STATUS_BLOCKED", status: "AWAY" },
    });
  });

  it("rejects at capacity without force", async () => {
    mockUser({ status: "ONLINE", max_concurrent: 2, active: 2 });
    await expect(assertAgentAssignable("agent-1")).rejects.toMatchObject({
      status: 409,
      details: { code: "AGENT_AT_CAPACITY" },
    });
  });

  it("allows blocked agent when force is true", async () => {
    mockUser({ status: "ON_BREAK", max_concurrent: 2, active: 2 });
    const out = await assertAgentAssignable("agent-1", { force: true });
    expect(out.forced).toBe(true);
    expect(out.status).toBe("ON_BREAK");
  });

  it("throws 404 when agent missing", async () => {
    vi.mocked(getPrisma).mockReturnValue({
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);
    await expect(assertAgentAssignable("missing")).rejects.toBeInstanceOf(HttpError);
  });
});
