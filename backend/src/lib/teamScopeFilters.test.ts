import { describe, expect, it } from "vitest";
import {
  conversationTeamFilter,
  isTeamScoped,
  qualityEvaluationTeamFilter,
  queueTeamFilter,
  userTeamFilter,
  voiceCallTeamFilter,
} from "./teamScopeFilters.js";

describe("isTeamScoped", () => {
  it("treats null/undefined as global", () => {
    expect(isTeamScoped(null)).toBe(false);
    expect(isTeamScoped(undefined)).toBe(false);
  });

  it("treats arrays (including empty) as scoped", () => {
    expect(isTeamScoped([])).toBe(true);
    expect(isTeamScoped(["t1"])).toBe(true);
  });
});

describe("team filters", () => {
  it("returns empty objects for global scope", () => {
    expect(conversationTeamFilter(null)).toEqual({});
    expect(userTeamFilter(undefined)).toEqual({});
    expect(queueTeamFilter(null)).toEqual({});
    expect(qualityEvaluationTeamFilter(null)).toEqual({});
    expect(voiceCallTeamFilter(null)).toEqual({});
  });

  it("scopes conversations to queue.team_id even when team list is empty", () => {
    expect(conversationTeamFilter([])).toEqual({ queue: { team_id: { in: [] } } });
    expect(conversationTeamFilter(["a", "b"])).toEqual({
      queue: { team_id: { in: ["a", "b"] } },
    });
  });

  it("scopes users and queues to membership / team_id", () => {
    expect(userTeamFilter(["t1"])).toEqual({ teams: { some: { team_id: { in: ["t1"] } } } });
    expect(queueTeamFilter(["t1"])).toEqual({ team_id: { in: ["t1"] } });
  });

  it("scopes quality evaluations via conversation.queue", () => {
    expect(qualityEvaluationTeamFilter(["t1"])).toEqual({
      conversation: { queue: { team_id: { in: ["t1"] } } },
    });
  });

  it("scopes voice calls by conversation queue or agent team", () => {
    expect(voiceCallTeamFilter(["t1"])).toEqual({
      OR: [
        { conversation: { queue: { team_id: { in: ["t1"] } } } },
        { user: { teams: { some: { team_id: { in: ["t1"] } } } } },
      ],
    });
  });
});
