import { describe, expect, it } from "vitest";
import { rankAgentsByStrategy, type AgentScore } from "./RoutingEngine.js";

function d(iso: string): Date {
  return new Date(iso);
}

const agents: AgentScore[] = [
  {
    userId: "a1",
    activeCount: 2,
    lastAssignedAt: d("2026-01-01T10:00:00.000Z"),
    lastEndedAt: d("2026-01-01T09:00:00.000Z"),
    skillScore: 8,
    priorityScore: 2,
  },
  {
    userId: "a2",
    activeCount: 0,
    lastAssignedAt: d("2026-01-01T12:00:00.000Z"),
    lastEndedAt: d("2026-01-01T11:00:00.000Z"),
    skillScore: 5,
    priorityScore: 1,
  },
  {
    userId: "a3",
    activeCount: 1,
    lastAssignedAt: d("2026-01-01T08:00:00.000Z"),
    lastEndedAt: d("2026-01-01T07:00:00.000Z"),
    skillScore: 10,
    priorityScore: 2,
  },
];

describe("rankAgentsByStrategy", () => {
  it("applies LEAST_BUSY", () => {
    const ranked = rankAgentsByStrategy(agents, "LEAST_BUSY");
    expect(ranked.map((a) => a.userId)).toEqual(["a2", "a3", "a1"]);
  });

  it("applies SKILL_BASED", () => {
    const ranked = rankAgentsByStrategy(agents, "SKILL_BASED");
    expect(ranked.map((a) => a.userId)).toEqual(["a3", "a1", "a2"]);
  });

  it("applies ROUND_ROBIN by oldest last assignment", () => {
    const ranked = rankAgentsByStrategy(agents, "ROUND_ROBIN");
    expect(ranked.map((a) => a.userId)).toEqual(["a3", "a1", "a2"]);
  });

  it("applies LONGEST_IDLE by oldest last ended", () => {
    const ranked = rankAgentsByStrategy(agents, "LONGEST_IDLE");
    expect(ranked.map((a) => a.userId)).toEqual(["a3", "a1", "a2"]);
  });

  it("applies PRIORITY_BASED using priority score first", () => {
    const ranked = rankAgentsByStrategy(agents, "PRIORITY_BASED");
    expect(ranked.map((a) => a.userId)).toEqual(["a3", "a1", "a2"]);
  });
});
