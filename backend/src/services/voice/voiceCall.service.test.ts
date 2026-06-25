import { describe, expect, it } from "vitest";
import { normalizePhoneNumber, normalizePhoneE164 } from "./voiceCall.service.js";

describe("normalizePhoneNumber (basic)", () => {
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

describe("normalizePhoneE164", () => {
  it("converts a local EC number to E.164", async () => {
    expect(await normalizePhoneE164("0991234567", "EC")).toBe("+593991234567");
  });

  it("converts a local CO number to E.164", async () => {
    expect(await normalizePhoneE164("3001234567", "CO")).toBe("+573001234567");
  });

  it("preserves already-valid E.164 numbers", async () => {
    expect(await normalizePhoneE164("+593991234567", "EC")).toBe("+593991234567");
    expect(await normalizePhoneE164("+15551234567", "US")).toBe("+15551234567");
  });

  it("normalizes formatted numbers with spaces and dashes", async () => {
    expect(await normalizePhoneE164("+593 99 123 4567", "EC")).toBe("+593991234567");
    expect(await normalizePhoneE164("(099) 123-4567", "EC")).toBe("+593991234567");
  });

  it("falls back to basic normalization for unparseable input", async () => {
    expect(await normalizePhoneE164("12345", "EC")).toBe("12345");
  });

  it("returns null for empty or non-numeric input", async () => {
    expect(await normalizePhoneE164("", "EC")).toBeNull();
    expect(await normalizePhoneE164("   ", "EC")).toBeNull();
    expect(await normalizePhoneE164(undefined, "EC")).toBeNull();
  });
});
