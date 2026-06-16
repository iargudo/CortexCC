import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAY_SLOTS,
  formatScheduleSlots,
  normalizeSchedule,
  validateSchedule,
} from "./businessHours";

describe("businessHours", () => {
  it("normalizes partial schedules with all week days", () => {
    const schedule = normalizeSchedule({
      monday: [{ start: "08:00", end: "17:00" }],
      friday: [{ start: "10:00", end: "14:00" }],
    });
    expect(schedule.monday).toEqual([{ start: "08:00", end: "17:00" }]);
    expect(schedule.tuesday).toEqual([]);
    expect(schedule.friday).toEqual([{ start: "10:00", end: "14:00" }]);
    expect(schedule.sunday).toEqual([]);
  });

  it("validates end time after start time", () => {
    expect(
      validateSchedule({
        monday: [{ start: "18:00", end: "09:00" }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      }),
    ).toMatch(/Lunes/);
  });

  it("formats closed days and split schedules", () => {
    expect(formatScheduleSlots([])).toBe("Cerrado");
    expect(formatScheduleSlots(DEFAULT_DAY_SLOTS)).toBe("09:00 – 13:00, 14:00 – 18:00");
  });
});
