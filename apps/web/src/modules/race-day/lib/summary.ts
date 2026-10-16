import type { RaceEntry, RaceRosterEntry } from "@skatingx/schema";
import { sortRaceEntries } from "@skatingx/skating-domain";

import type { Locale } from "@/shared/i18n/translator";

const TAG: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

/**
 * The summary is about the user's own athlete. If the roster marks several as "mine" (which the
 * Setup form does not prevent) the first by id is used and the page says so, so the choice is
 * never silent.
 */
export function pickSelfAthlete(roster: readonly RaceRosterEntry[]): {
  self: RaceRosterEntry | null;
  selfCount: number;
} {
  const selves = roster.filter((entry) => entry.isSelf).sort((a, b) => a.rosterId.localeCompare(b.rosterId));
  return { self: selves[0] ?? null, selfCount: selves.length };
}

/** "#n" as on the Schedule tab: the place in the whole schedule, not only in this athlete's races. */
export function raceNumberById(races: readonly RaceEntry[]): Map<string, number> {
  const numbers = new Map<string, number>();
  sortRaceEntries(races).forEach((race, index) => numbers.set(race.raceId, index + 1));
  return numbers;
}

/**
 * When the note was last saved, as wall-clock time in the event's zone with the zone shown. With
 * no event zone it is shown in UTC and labelled, never in a guessed zone (ADR-001).
 */
export function formatSavedAt(instant: string, locale: Locale, timeZone: string | null): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) {
    return instant;
  }
  try {
    return new Intl.DateTimeFormat(TAG[locale], {
      // Not `dateStyle`/`timeStyle`: those cannot be combined with `timeZoneName` (it throws).
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timeZone ?? "UTC",
      timeZoneName: "short",
    }).format(ms);
  } catch (error) {
    console.warn("[race-day] cannot format saved time", error instanceof Error ? error.name : "unknown");
    return instant;
  }
}
