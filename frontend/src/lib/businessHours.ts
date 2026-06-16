export type TimeSlot = { start: string; end: string };
export type WeekSchedule = Record<string, TimeSlot[]>;

export const WEEK_DAYS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

export type WeekDayKey = (typeof WEEK_DAYS)[number]["key"];

export const WEEKDAY_KEYS: WeekDayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

/** Mañana y tarde con pausa de almuerzo (13:00–14:00). */
export const DEFAULT_DAY_SLOTS: TimeSlot[] = [
  { start: "09:00", end: "13:00" },
  { start: "14:00", end: "18:00" },
];

export function createDefaultDaySlots(): TimeSlot[] {
  return DEFAULT_DAY_SLOTS.map((slot) => ({ ...slot }));
}

export const DEFAULT_SCHEDULE: WeekSchedule = {
  monday: createDefaultDaySlots(),
  tuesday: createDefaultDaySlots(),
  wednesday: createDefaultDaySlots(),
  thursday: createDefaultDaySlots(),
  friday: createDefaultDaySlots(),
  saturday: [],
  sunday: [],
};

export const TIMEZONE_OPTIONS = [
  { value: "America/Guayaquil", label: "Ecuador (Guayaquil)" },
  { value: "America/Bogota", label: "Colombia (Bogotá)" },
  { value: "America/Lima", label: "Perú (Lima)" },
  { value: "America/Santiago", label: "Chile (Santiago)" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { value: "America/Mexico_City", label: "México (Ciudad de México)" },
  { value: "America/New_York", label: "Estados Unidos (Este)" },
  { value: "America/Chicago", label: "Estados Unidos (Centro)" },
  { value: "America/Los_Angeles", label: "Estados Unidos (Pacífico)" },
  { value: "Europe/Madrid", label: "España (Madrid)" },
  { value: "UTC", label: "UTC" },
];

const DAY_LABELS: Record<string, string> = Object.fromEntries(WEEK_DAYS.map((d) => [d.key, d.label]));

export function dayLabel(dayKey: string): string {
  return DAY_LABELS[dayKey] ?? dayKey;
}

export function normalizeSchedule(schedule: unknown): WeekSchedule {
  const base = structuredClone(DEFAULT_SCHEDULE);
  if (!schedule || typeof schedule !== "object") return base;

  for (const { key } of WEEK_DAYS) {
    const slots = (schedule as Record<string, unknown>)[key];
    if (!Array.isArray(slots)) {
      base[key] = [];
      continue;
    }
    base[key] = slots
      .filter((slot): slot is TimeSlot => {
        if (!slot || typeof slot !== "object") return false;
        const s = slot as TimeSlot;
        return typeof s.start === "string" && typeof s.end === "string";
      })
      .map((slot) => ({ start: slot.start, end: slot.end }));
  }
  return base;
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateSchedule(schedule: WeekSchedule): string | null {
  for (const { key, label } of WEEK_DAYS) {
    const slots = schedule[key] ?? [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const start = timeToMinutes(slot.start);
      const end = timeToMinutes(slot.end);
      if (start === null || end === null) {
        return `${label}: formato de hora inválido (use HH:MM)`;
      }
      if (end <= start) {
        return `${label}: la hora de fin debe ser posterior a la de inicio`;
      }
    }
  }
  return null;
}

export function formatScheduleSlots(slots: TimeSlot[] | undefined): string {
  if (!Array.isArray(slots) || slots.length === 0) return "Cerrado";
  return slots.map((slot) => `${slot.start} – ${slot.end}`).join(", ");
}
