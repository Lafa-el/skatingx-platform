import type { DateString, RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";

import { isRealDateString } from "./race-day-input";
import { eventPhase } from "./race-day-today";

/**
 * Which Race Day events the dashboard card shows (docs/design/race-day-linkages.md 2.b).
 * Pure: "now" and the device's calendar day are arguments, and nothing here reads or writes data.
 *
 * Kept free of the rest of Race Day on purpose: the dashboard is in the main bundle, so this file
 * only reaches for `isRealDateString` and `eventPhase`.
 */

export type OverviewEvent = Pick<RaceEvent, "eventId" | "dates" | "timeZone">;

/** "ongoing" is an event whose first day has come and whose last day has not passed. */
export type OverviewEventStatus = "upcoming" | "ongoing" | "past";

export type OverviewEventPick<E extends OverviewEvent> = {
  event: E;
  /** Earliest and latest valid day of the event. */
  firstDay: DateString;
  lastDay: DateString;
  status: OverviewEventStatus;
  /**
   * True when "today" was judged in the event's own time zone. False when the zone is unknown or
   * not a real zone, and the device's calendar day was used instead.
   */
  zoneKnown: boolean;
  /** Whole days until the first day; only for an upcoming event whose zone is known. */
  daysUntil: number | null;
};

export type OverviewEvents<E extends OverviewEvent> = {
  next: OverviewEventPick<E> | null;
  previous: OverviewEventPick<E> | null;
};

/** Code-unit order, so the same ids sort the same way on every device and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The codec only checks that `dates` is a string array, so anything that is not a real calendar
 * day is dropped here. An event left with no valid day takes no part (it stays visible and
 * editable in the Race Day setup page).
 */
function validDays(dates: readonly string[]): DateString[] {
  return [...new Set(dates.filter(isRealDateString))].sort(compareText);
}

function describeEvent<E extends OverviewEvent>(
  event: E,
  now: string,
  deviceToday: DateString,
): { pick: OverviewEventPick<E>; isPast: boolean } | null {
  const days = validDays(event.dates);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  if (firstDay === undefined || lastDay === undefined) {
    return null;
  }

  // Only the valid days are given to `eventPhase`, so a malformed one cannot move its first or last.
  const phase = eventPhase({ dates: days, timeZone: event.timeZone }, now);
  const zoneKnown = phase.kind !== "undetermined";
  const today = phase.kind === "undetermined" ? deviceToday : phase.today;

  const isPast = lastDay < today;
  const status: OverviewEventStatus = isPast ? "past" : today < firstDay ? "upcoming" : "ongoing";
  return {
    isPast,
    pick: {
      event,
      firstDay,
      lastDay,
      status,
      zoneKnown,
      daysUntil: status === "upcoming" && phase.kind === "before" ? phase.daysUntil : null,
    },
  };
}

/**
 * Next: of the events whose last day has not passed, the one that starts first (ties by eventId).
 * An event that is under way counts as the next one. Previous: of the events that are over, the one
 * that ended last (ties by eventId).
 */
export function pickNextAndPreviousEvents<E extends OverviewEvent>(
  events: readonly E[],
  now: string,
  deviceToday: DateString,
): OverviewEvents<E> {
  const upcoming: OverviewEventPick<E>[] = [];
  const over: OverviewEventPick<E>[] = [];
  for (const event of events) {
    const described = describeEvent(event, now, deviceToday);
    if (described) {
      (described.isPast ? over : upcoming).push(described.pick);
    }
  }

  upcoming.sort(
    (a, b) => compareText(a.firstDay, b.firstDay) || compareText(a.event.eventId, b.event.eventId),
  );
  over.sort(
    (a, b) => compareText(b.lastDay, a.lastDay) || compareText(a.event.eventId, b.event.eventId),
  );
  return { next: upcoming[0] ?? null, previous: over[0] ?? null };
}

/**
 * The user's own roster row. Same rule as the summary page and the records sync: marked
 * `isSelf`, and the first by id when several are.
 */
export function ownRosterEntry(roster: readonly RaceRosterEntry[]): RaceRosterEntry | null {
  const own = roster.filter((entry) => entry.isSelf).sort((a, b) => compareText(a.rosterId, b.rosterId));
  return own[0] ?? null;
}

export type OverviewResultRow = { result: RaceResult; race: RaceEntry };

export const OVERVIEW_RESULT_LIMIT = 3;

function dayOf(race: RaceEntry): string | null {
  return race.day !== null && isRealDateString(race.day) ? race.day : null;
}

/**
 * The user's own latest results: newest race day first, a race with no known day last, ties by
 * raceId. Results whose race is gone are left out (deleting a race deletes its results, so this
 * is only a half-loaded list). Every status is kept: a DNF is a result too.
 */
export function recentOwnResults(
  input: {
    results: readonly RaceResult[];
    races: readonly RaceEntry[];
    roster: readonly RaceRosterEntry[];
  },
  limit: number = OVERVIEW_RESULT_LIMIT,
): OverviewResultRow[] {
  const own = ownRosterEntry(input.roster);
  if (!own) {
    return [];
  }
  const raceById = new Map(input.races.map((race) => [race.raceId, race]));
  const rows: OverviewResultRow[] = [];
  for (const result of input.results) {
    const race = raceById.get(result.raceId);
    if (race && result.rosterId === own.rosterId) {
      rows.push({ result, race });
    }
  }
  rows.sort((a, b) => {
    const dayA = dayOf(a.race);
    const dayB = dayOf(b.race);
    if (dayA !== dayB) {
      if (dayA === null) return 1;
      if (dayB === null) return -1;
      return compareText(dayB, dayA);
    }
    return compareText(a.race.raceId, b.race.raceId);
  });
  return rows.slice(0, Math.max(0, limit));
}
