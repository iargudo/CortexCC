import { describe, expect, it } from "vitest";
import {
  defaultRolePermissions,
  hasPermission,
  resolveRolePermissions,
} from "./permissions.js";

describe("hasPermission", () => {
  it("returns true when module allowed", () => {
    expect(hasPermission({ inbox: true, settings: false }, "inbox")).toBe(true);
  });

  it("returns false when missing or false", () => {
    expect(hasPermission({ inbox: false }, "inbox")).toBe(false);
    expect(hasPermission({}, "settings")).toBe(false);
    expect(hasPermission(null, "inbox")).toBe(false);
    expect(hasPermission(undefined, "inbox")).toBe(false);
    expect(hasPermission("invalid", "inbox")).toBe(false);
  });
});

describe("defaultRolePermissions", () => {
  it("grants full access to admin", () => {
    expect(defaultRolePermissions.admin.settings).toBe(true);
    expect(defaultRolePermissions.admin.supervisor).toBe(true);
  });

  it("restricts settings for supervisor and agent", () => {
    expect(defaultRolePermissions.supervisor.settings).toBe(false);
    expect(defaultRolePermissions.agent.settings).toBe(false);
    expect(defaultRolePermissions.agent.supervisor).toBe(false);
  });

  it("coordinator supervises but has no settings access", () => {
    expect(defaultRolePermissions.coordinator.supervisor).toBe(true);
    expect(defaultRolePermissions.coordinator.settings).toBe(false);
  });

  it("allows inbox for all operational roles", () => {
    expect(defaultRolePermissions.admin.inbox).toBe(true);
    expect(defaultRolePermissions.supervisor.inbox).toBe(true);
    expect(defaultRolePermissions.agent.inbox).toBe(true);
  });
});

describe("resolveRolePermissions", () => {
  it("fills missing keys from role defaults", () => {
    expect(resolveRolePermissions("coordinator", { inbox: true }).supervisor).toBe(true);
    expect(resolveRolePermissions("agent", { inbox: true }).supervisor).toBe(false);
  });

  it("lets stored overrides win over defaults", () => {
    expect(resolveRolePermissions("agent", { supervisor: true }).supervisor).toBe(true);
    expect(resolveRolePermissions("coordinator", { supervisor: false }).supervisor).toBe(false);
  });

  it("returns only stored map for unknown roles", () => {
    expect(resolveRolePermissions("custom", { settings: true })).toEqual({ settings: true });
  });
});
