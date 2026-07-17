/**
 * Evaluación del horario de atención de una cola, basada en el modelo unificado
 * `BusinessHours` (referenciado por `Queue.business_hours_id`).
 */

const DEFAULT_TZ = "America/Guayaquil";

function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Evaluación del horario canónico de `BusinessHours` (modelo unificado).
 *
 * Formato de `schedule` (uno o varios slots por día, claves con nombre completo):
 *   { "monday": [{ "start": "09:00", "end": "13:00" }, ...], ..., "sunday": [] }
 *
 * `timezone` viene de la columna `BusinessHours.timezone`.
 * `holidays` es un arreglo de fechas "YYYY-MM-DD" (en la zona horaria dada);
 * si hoy es feriado => cerrado todo el día.
 *
 * Sin ningún slot en ningún día => se considera siempre abierto (no bloquea).
 */
const FULL_DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type CanonicalSlot = { start?: string; end?: string };

export function isWithinBusinessHours(
  schedule: unknown,
  timezone: string | null | undefined,
  holidays: unknown,
  now: Date = new Date()
): boolean {
  if (!schedule || typeof schedule !== "object") return true;
  const days = schedule as Record<string, unknown>;

  const hasAnySlot = FULL_DAY_KEYS.some((k) => Array.isArray(days[k]) && (days[k] as unknown[]).length > 0);
  if (!hasAnySlot) return true; // sin horario configurado => siempre abierto

  const tz = typeof timezone === "string" && timezone ? timezone : DEFAULT_TZ;

  let weekdayIdx = -1;
  let dateKey = "";
  let hh = "00";
  let mm = "00";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    let y = "";
    let mo = "";
    let d = "";
    for (const p of parts) {
      if (p.type === "weekday") {
        const wd = p.value.toLowerCase().slice(0, 3);
        weekdayIdx = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(wd);
      } else if (p.type === "year") y = p.value;
      else if (p.type === "month") mo = p.value;
      else if (p.type === "day") d = p.value;
      else if (p.type === "hour") hh = p.value;
      else if (p.type === "minute") mm = p.value;
    }
    dateKey = `${y}-${mo}-${d}`;
  } catch {
    return true; // timezone inválido => no bloquear
  }

  if (Array.isArray(holidays) && holidays.map(String).includes(dateKey)) {
    return false; // feriado => cerrado todo el día
  }

  if (weekdayIdx < 0) return true;
  const slots = days[FULL_DAY_KEYS[weekdayIdx]];
  if (!Array.isArray(slots) || slots.length === 0) return false; // día sin slots => cerrado

  const nowMin = Number(hh) * 60 + Number(mm);
  for (const raw of slots as CanonicalSlot[]) {
    if (!raw || typeof raw !== "object") continue;
    const start = parseHm(String(raw.start ?? ""));
    const end = parseHm(String(raw.end ?? ""));
    if (start == null || end == null) continue;
    if (end <= start) {
      if (nowMin >= start) return true; // cruza medianoche
    } else if (nowMin >= start && nowMin < end) {
      return true;
    }
  }
  return false;
}
