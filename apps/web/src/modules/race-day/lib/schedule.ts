import type { RaceEntry } from "@skatingx/schema";

import type { Locale } from "@/shared/i18n/translator";

const TAG: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

/**
 * Start time as wall-clock time in the event's zone, with the zone abbreviation, so what is
 * shown is never ambiguous. With no event zone the instant is shown in UTC and labelled as such:
 * guessing the viewer's zone is exactly what ADR-001 rules out.
 */
export function formatRaceTime(instant: string, locale: Locale, timeZone: string | null): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) {
    return instant;
  }
  try {
    return new Intl.DateTimeFormat(TAG[locale], {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timeZone ?? "UTC",
      timeZoneName: "short",
    }).format(ms);
  } catch (error) {
    // An unknown zone name should not blank the schedule; fall back to the raw instant.
    console.warn("[race-day] cannot format race time", error instanceof Error ? error.name : "unknown");
    return instant;
  }
}

/** "2026-10-24" -> "Sat, Oct 24" / "10月24日周六". Calendar days have no zone, so UTC is exact. */
export function formatRaceDay(day: string, locale: Locale): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) {
    return day;
  }
  return new Intl.DateTimeFormat(TAG[locale], {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(year, month - 1, date));
}

const DAY_SEPARATOR: Record<Locale, string> = { zh: "、", en: " / " };

/** Event days for display: sorted, each in the reader's language (never a raw ISO date). */
export function formatRaceDays(days: readonly string[], locale: Locale): string {
  return [...days]
    .sort()
    .map((day) => formatRaceDay(day, locale))
    .join(DAY_SEPARATOR[locale]);
}

/** "#2 500m · Sat, Oct 24": how a race is named in pickers and headings. */
export function raceOptionLabel(
  race: Pick<RaceEntry, "label" | "day">,
  number: number | null,
  locale: Locale,
): string {
  const prefix = number === null ? "" : `#${String(number)} `;
  const day = race.day ? ` · ${formatRaceDay(race.day, locale)}` : "";
  return `${prefix}${race.label}${day}`;
}

/** The sort order a newly added race gets: after every existing one. */
export function nextSortOrder(races: readonly RaceEntry[]): number {
  return races.reduce((max, race) => Math.max(max, race.sortOrder + 1), 0);
}
