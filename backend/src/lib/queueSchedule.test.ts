import { describe, expect, it } from "vitest";
import { isWithinBusinessHours } from "./queueSchedule.js";

const TZ = "America/Guayaquil";

// Formato canónico de BusinessHours: arrays de slots por día con nombre completo.
const schedule = {
  monday: [{ start: "08:00", end: "20:00" }],
  tuesday: [{ start: "08:00", end: "20:00" }],
  wednesday: [{ start: "08:00", end: "20:00" }],
  thursday: [{ start: "08:00", end: "20:00" }],
  friday: [{ start: "08:00", end: "20:00" }],
  saturday: [{ start: "09:00", end: "14:00" }],
  sunday: [],
};

// Con pausa de almuerzo (dos slots).
const splitSchedule = {
  monday: [
    { start: "09:00", end: "13:00" },
    { start: "14:00", end: "18:00" },
  ],
};

// America/Guayaquil = UTC-5 (sin horario de verano). 2026-07-06 es lunes.
function at(dateIsoUtc: string): Date {
  return new Date(dateIsoUtc);
}

describe("isWithinBusinessHours", () => {
  it("sin schedule => siempre abierto", () => {
    expect(isWithinBusinessHours(null, TZ, null)).toBe(true);
    expect(isWithinBusinessHours(undefined, TZ, null)).toBe(true);
    expect(isWithinBusinessHours({}, TZ, null)).toBe(true);
  });

  it("schedule sin slots en ningún día => siempre abierto", () => {
    expect(isWithinBusinessHours({ monday: [], sunday: [] }, TZ, null)).toBe(true);
  });

  it("lunes 10:00 local (15:00 UTC) => abierto", () => {
    expect(isWithinBusinessHours(schedule, TZ, null, at("2026-07-06T15:00:00Z"))).toBe(true);
  });

  it("lunes 07:00 local (12:00 UTC) => cerrado (antes de abrir)", () => {
    expect(isWithinBusinessHours(schedule, TZ, null, at("2026-07-06T12:00:00Z"))).toBe(false);
  });

  it("lunes 21:00 local => cerrado (después de cerrar)", () => {
    expect(isWithinBusinessHours(schedule, TZ, null, at("2026-07-07T02:00:00Z"))).toBe(false);
  });

  it("domingo => cerrado todo el día", () => {
    expect(isWithinBusinessHours(schedule, TZ, null, at("2026-07-05T18:00:00Z"))).toBe(false);
  });

  it("sábado 12:00 local (17:00 UTC) => abierto en ventana reducida", () => {
    expect(isWithinBusinessHours(schedule, TZ, null, at("2026-07-04T17:00:00Z"))).toBe(true);
  });

  it("pausa de almuerzo: 13:30 local => cerrado entre slots", () => {
    expect(isWithinBusinessHours(splitSchedule, TZ, null, at("2026-07-06T18:30:00Z"))).toBe(false);
  });

  it("pausa de almuerzo: 15:00 local => abierto en segundo slot", () => {
    expect(isWithinBusinessHours(splitSchedule, TZ, null, at("2026-07-06T20:00:00Z"))).toBe(true);
  });

  it("feriado => cerrado aunque sea día/hora laboral", () => {
    // Lunes 10:00 local pero marcado como feriado.
    expect(isWithinBusinessHours(schedule, TZ, ["2026-07-06"], at("2026-07-06T15:00:00Z"))).toBe(false);
  });
});
