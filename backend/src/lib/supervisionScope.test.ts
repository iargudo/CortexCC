import { describe, expect, it } from "vitest";
import { getSupervisionScope, scopeTeamIds } from "./supervisionScope.js";
import type { AuthUserPayload } from "../middleware/auth.js";

function user(
  roleNames: string[],
  coordinatorTeamIds: string[] = []
): AuthUserPayload {
  return {
    id: "u1",
    email: "u@test.local",
    first_name: "U",
    last_name: "One",
    avatar_url: null,
    status: "ONLINE",
    max_concurrent: 5,
    roles: roleNames.map((name) => ({ name, permissions: {} })),
    coordinatorTeamIds,
  };
}

describe("getSupervisionScope", () => {
  it("admin is global", () => {
    const scope = getSupervisionScope(user(["admin"], ["t1"]));
    expect(scope).toEqual({ isSupervisor: true, global: true, teamIds: [] });
    expect(scopeTeamIds(scope)).toBeNull();
  });

  it("supervisor (jefatura) is global even if listed as coordinator member", () => {
    const scope = getSupervisionScope(user(["supervisor"], ["t1"]));
    expect(scope.global).toBe(true);
    expect(scopeTeamIds(scope)).toBeNull();
  });

  it("coordinator role is scoped to the teams it coordinates", () => {
    const scope = getSupervisionScope(user(["coordinator"], ["t1", "t2"]));
    expect(scope).toEqual({ isSupervisor: true, global: false, teamIds: ["t1", "t2"] });
    expect(scopeTeamIds(scope)).toEqual(["t1", "t2"]);
  });

  it("coordinator without assigned teams sees nothing (safe default)", () => {
    const scope = getSupervisionScope(user(["coordinator"], []));
    expect(scope).toEqual({ isSupervisor: true, global: false, teamIds: [] });
    expect(scopeTeamIds(scope)).toEqual([]);
  });

  it("supervisor+coordinator combined stays global (jefatura wins)", () => {
    const scope = getSupervisionScope(user(["supervisor", "coordinator"], ["t1"]));
    expect(scope.global).toBe(true);
  });

  it("plain agent is not a supervisor even if listed as coordinator team member", () => {
    const scope = getSupervisionScope(user(["agent"], ["t1"]));
    expect(scope.isSupervisor).toBe(false);
    expect(scope.global).toBe(false);
  });

  it("handles undefined user", () => {
    expect(getSupervisionScope(undefined).isSupervisor).toBe(false);
  });
});
