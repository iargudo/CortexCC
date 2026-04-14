import { describe, expect, it } from "vitest";
import { canonicalPhone, normalizePhone, phoneCandidates } from "./phone.js";

describe("normalizePhone", () => {
  it("normalizes whatsapp ids and symbols", () => {
    expect(normalizePhone("whatsapp:+593 99 590 6687")).toBe("593995906687");
    expect(normalizePhone("593995906687@c.us")).toBe("593995906687");
  });
});

describe("phoneCandidates", () => {
  it("builds local/international variants for Ecuador style numbers", () => {
    const c1 = phoneCandidates("0995906687");
    expect(c1).toContain("0995906687");
    expect(c1).toContain("593995906687");

    const c2 = phoneCandidates("+593995906687");
    expect(c2).toContain("593995906687");
    expect(c2).toContain("0995906687");
  });
});

describe("canonicalPhone", () => {
  it("normalizes local Ecuador numbers to international format", () => {
    expect(canonicalPhone("0995906687")).toBe("593995906687");
    expect(canonicalPhone("995906687")).toBe("593995906687");
  });
});
