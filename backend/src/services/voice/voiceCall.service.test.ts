import { describe, expect, it } from "vitest";
import { normalizePhoneNumber } from "./voiceCall.service.js";

describe("normalizePhoneNumber", () => {
  it("normalizes E.164 numbers with plus prefix", () => {
    expect(normalizePhoneNumber("+593 99 123 4567")).toBe("+593991234567");
  });

  it("keeps local numbers without plus", () => {
    expect(normalizePhoneNumber("0991234567")).toBe("0991234567");
  });

  it("strips formatting characters", () => {
    expect(normalizePhoneNumber("(02) 234-5678")).toBe("022345678");
    expect(normalizePhoneNumber("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("returns null for empty or non-numeric input", () => {
    expect(normalizePhoneNumber("")).toBeNull();
    expect(normalizePhoneNumber("   ")).toBeNull();
    expect(normalizePhoneNumber(undefined)).toBeNull();
    expect(normalizePhoneNumber("abc")).toBeNull();
  });
});
