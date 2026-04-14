import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions.js";

describe("hasPermission", () => {
  it("returns true when module allowed", () => {
    expect(hasPermission({ inbox: true, settings: false }, "inbox")).toBe(true);
  });

  it("returns false when missing or false", () => {
    expect(hasPermission({ inbox: false }, "inbox")).toBe(false);
    expect(hasPermission({}, "settings")).toBe(false);
    expect(hasPermission(null, "inbox")).toBe(false);
  });
});
