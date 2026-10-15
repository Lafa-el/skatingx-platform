import { isRealDateString } from "./race-day-input";

/**
 * Wall-clock time in a named IANA zone <-> UTC instant (ADR-001: the zone is never assumed).
 * Pure and deterministic: only `Intl` and the arguments are used, never the device zone.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function partsInZone(ms: number, timeZone: string): Parts {
  const out: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== "literal") {
      out[part.type] = Number(part.value);
    }
  }
  return {
    year: out["year"] ?? NaN,
    month: out["month"] ?? NaN,
    day: out["day"] ?? NaN,
    hour: out["hour"] ?? NaN,
    minute: out["minute"] ?? NaN,
  };
}

/** Offset of the zone from UTC at an instant, in ms (positive east of Greenwich). */
function offsetMs(ms: number, timeZone: string): number {
  const p = partsInZone(ms, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return wall - Math.floor(ms / 60000) * 60000;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * "2026-10-24" + "09:30" in "America/New_York" -> "2026-10-24T13:30:00.000Z".
 * Returns null for an invalid day, time or zone, and for a wall time that does not exist in the
 * zone (the hour skipped by a clock change), so a typo is reported instead of silently shifted.
 */
export function zonedDateTimeToInstant(day: string, time: string, timeZone: string): string | null {
  const timeMatch = TIME_PATTERN.exec(time);
  if (!isRealDateString(day) || !timeMatch) {
    return null;
  }
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  try {
    const asUtc = Date.UTC(year, month - 1, date, hour, minute);
    const first = asUtc - offsetMs(asUtc, timeZone);
    const resolved = asUtc - offsetMs(first, timeZone);

    const back = partsInZone(resolved, timeZone);
    if (
      back.year !== year ||
      back.month !== month ||
      back.day !== date ||
      back.hour !== hour ||
      back.minute !== minute
    ) {
      return null;
    }
    return new Date(resolved).toISOString();
  } catch {
    // An unknown zone name makes Intl throw RangeError: "cannot convert" is the answer.
    return null;
  }
}

/** Inverse of `zonedDateTimeToInstant`, for pre-filling the edit form. Null if it cannot be shown. */
export function instantToZonedDateTime(
  instant: string,
  timeZone: string,
): { day: string; time: string } | null {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) {
    return null;
  }
  try {
    const p = partsInZone(ms, timeZone);
    return {
      day: `${String(p.year).padStart(4, "0")}-${pad(p.month)}-${pad(p.day)}`,
      time: `${pad(p.hour)}:${pad(p.minute)}`,
    };
  } catch {
    return null;
  }
}
