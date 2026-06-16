import { describe, expect, it } from "vitest";
import { getCurrentTenantKey, runWithTenant } from "./tenantContext.js";

describe("tenantContext", () => {
  it("runWithTenant sets context for nested calls", () => {
    runWithTenant("local", "Desarrollo Local", () => {
      expect(getCurrentTenantKey()).toBe("local");
    });
  });

  it("throws when no tenant context", () => {
    expect(() => getCurrentTenantKey()).toThrow(/No tenant context/);
  });
});
