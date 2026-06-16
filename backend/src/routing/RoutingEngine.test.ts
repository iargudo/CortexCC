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

  it("returns empty array when no agents are eligible", () => {
    expect(rankAgentsByStrategy([], "LEAST_BUSY")).toEqual([]);
  });

  it("does not mutate the original agents array", () => {
    const copy = [...agents];
    rankAgentsByStrategy(agents, "SKILL_BASED");
    expect(agents).toEqual(copy);
  });

  it("breaks LEAST_BUSY ties by higher skill score", () => {
    const tied: AgentScore[] = [
      { ...agents[0], userId: "t1", activeCount: 1, skillScore: 3 },
      { ...agents[0], userId: "t2", activeCount: 1, skillScore: 9 },
    ];
    const ranked = rankAgentsByStrategy(tied, "LEAST_BUSY");
    expect(ranked.map((a) => a.userId)).toEqual(["t2", "t1"]);
  });

  it("prefers higher priority score in PRIORITY_BASED", () => {
    const tied: AgentScore[] = [
      { ...agents[1], userId: "low", priorityScore: 1, activeCount: 0, skillScore: 10 },
      { ...agents[2], userId: "high", priorityScore: 2, activeCount: 0, skillScore: 1 },
    ];
    const ranked = rankAgentsByStrategy(tied, "PRIORITY_BASED");
    expect(ranked[0].userId).toBe("high");
  });

  it("defaults unknown strategy to ROUND_ROBIN ordering", () => {
    const ranked = rankAgentsByStrategy(agents, "ROUND_ROBIN");
    expect(ranked.map((a) => a.userId)).toEqual(["a3", "a1", "a2"]);
  });

  it("handles null assignment timestamps in ROUND_ROBIN", () => {
    const withNulls: AgentScore[] = [
      { ...agents[0], userId: "n1", lastAssignedAt: null, activeCount: 0 },
      { ...agents[1], userId: "n2", lastAssignedAt: d("2026-01-01T12:00:00.000Z"), activeCount: 0 },
    ];
    const ranked = rankAgentsByStrategy(withNulls, "ROUND_ROBIN");
    expect(ranked[0].userId).toBe("n1");
  });
});
