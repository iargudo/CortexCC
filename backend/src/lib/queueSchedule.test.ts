import { describe, expect, it } from "vitest";
import { isWithinSchedule } from "./queueSchedule.js";

const schedule = {
  timezone: "America/Guayaquil",
  mon: { open: "08:00", close: "20:00" },
  tue: { open: "08:00", close: "20:00" },
  wed: { open: "08:00", close: "20:00" },
  thu: { open: "08:00", close: "20:00" },
  fri: { open: "08:00", close: "20:00" },
  sat: { open: "09:00", close: "14:00" },
  sun: null,
};

// America/Guayaquil = UTC-5 (sin horario de verano).
// 2026-07-06 es lunes.
function guayaquil(dateIsoUtc: string): Date {
  return new Date(dateIsoUtc);
}

describe("isWithinSchedule", () => {
  it("sin schedule => siempre abierto", () => {
    expect(isWithinSchedule(null)).toBe(true);
    expect(isWithinSchedule(undefined)).toBe(true);
    expect(isWithinSchedule({})).toBe(true);
  });

  it("lunes 10:00 local (15:00 UTC) => abierto", () => {
    expect(isWithinSchedule(schedule, guayaquil("2026-07-06T15:00:00Z"))).toBe(true);
  });

  it("lunes 07:00 local (12:00 UTC) => cerrado (antes de abrir)", () => {
    expect(isWithinSchedule(schedule, guayaquil("2026-07-06T12:00:00Z"))).toBe(false);
  });

  it("lunes 21:00 local (02:00 UTC del martes) => cerrado (después de cerrar)", () => {
    expect(isWithinSchedule(schedule, guayaquil("2026-07-07T02:00:00Z"))).toBe(false);
  });

  it("domingo => cerrado todo el día", () => {
    expect(isWithinSchedule(schedule, guayaquil("2026-07-05T18:00:00Z"))).toBe(false);
  });

  it("sábado 12:00 local (17:00 UTC) => abierto en ventana reducida", () => {
    expect(isWithinSchedule(schedule, guayaquil("2026-07-04T17:00:00Z"))).toBe(true);
  });

  it("acepta días anidados en schedule.days", () => {
    const nested = { timezone: "America/Guayaquil", days: { mon: { open: "08:00", close: "20:00" } } };
    expect(isWithinSchedule(nested, guayaquil("2026-07-06T15:00:00Z"))).toBe(true);
  });
});
