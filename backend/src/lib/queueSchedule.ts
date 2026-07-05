/**
 * Evaluación de horario de atención de una cola.
 *
 * Formato esperado del campo `Queue.schedule` (Json), compatible con el que usa
 * `businessHours`, con `timezone` opcional (default America/Guayaquil):
 *
 * {
 *   "timezone": "America/Guayaquil",
 *   "mon": { "open": "08:00", "close": "20:00" },
 *   ...
 *   "sun": null            // día cerrado
 * }
 *
 * Los días también pueden venir anidados en `schedule.days`.
 * Sin schedule (null / vacío) => siempre abierto.
 */

const DEFAULT_TZ = "America/Guayaquil";
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type DayWindow = { open?: string; close?: string } | null | undefined;

function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function isWithinSchedule(schedule: unknown, now: Date = new Date()): boolean {
  if (!schedule || typeof schedule !== "object") return true; // sin horario => siempre abierto
  const s = schedule as Record<string, unknown>;
  const tz = typeof s.timezone === "string" && s.timezone ? s.timezone : DEFAULT_TZ;
  const days = (s.days && typeof s.days === "object" ? s.days : s) as Record<string, unknown>;

  // Sin ningún día configurado => sin restricción (siempre abierto).
  if (!DAY_KEYS.some((k) => k in days)) return true;

  let weekday = "";
  let hh = "00";
  let mm = "00";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    for (const p of parts) {
      if (p.type === "weekday") weekday = p.value.toLowerCase().slice(0, 3);
      else if (p.type === "hour") hh = p.value;
      else if (p.type === "minute") mm = p.value;
    }
  } catch {
    return true; // timezone inválido => no bloquear
  }

  const window = days[weekday] as DayWindow;
  if (!window || typeof window !== "object") return false; // día sin ventana => cerrado
  const open = parseHm(String(window.open ?? ""));
  const close = parseHm(String(window.close ?? ""));
  if (open == null || close == null) return true; // config incompleta => no bloquear
  const nowMin = Number(hh) * 60 + Number(mm);
  if (close <= open) return nowMin >= open; // cruza medianoche (caso simple)
  return nowMin >= open && nowMin < close;
}
