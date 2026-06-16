import { describe, expect, it } from "vitest";
import { slaCheckDelayMs } from "./slaCheck.service.js";

describe("slaCheckDelayMs", () => {
  it("schedules check at the SLA deadline when still in the future", () => {
    const createdAt = new Date("2026-01-01T12:00:00.000Z");
    const now = createdAt.getTime() + 60_000;
    expect(slaCheckDelayMs(createdAt, 300, now)).toBe(240_000);
  });

  it("uses minimum delay when deadline already passed", () => {
    const createdAt = new Date("2026-01-01T12:00:00.000Z");
    const now = createdAt.getTime() + 400_000;
    expect(slaCheckDelayMs(createdAt, 300, now)).toBe(5_000);
  });
});
