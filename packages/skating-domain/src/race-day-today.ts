import type { DateString, RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";

import { isConfirmed, sortRaceEntries } from "./race-day";
import { instantToZonedDateTime } from "./race-day-time";

/**
 * The "Today" view of an event (Race Day Phase 0, S5a). Pure: the current time is an argument,
 * and "today" is the calendar day in the EVENT's zone, never the device's (ADR-001). It only
 * arranges data that was already entered; it creates no result, time or advice.
 */

export const RACE_DAY_TODAY_VERSION = "race-today/1";

export type EventPhase =
  /** "Today" cannot be decided, so no day is shown and nothing is guessed. */
  | { kind: "undetermined"; reason: "noTimeZone" | "badTimeZone" | "noDates" | "badClock" }
  | { kind: "before"; today: DateString; firstDay: DateString; daysUntil: number }
  | { kind: "today"; today: DateString }
  /** Inside the event's span, on a day that is not one of its dates. */
  | { kind: "between"; today: DateString; nextDay: DateString }
  | { kind: "after"; today: DateString; lastDay: DateString };

export type TodayRace = {
  race: RaceEntry;
  /** Place in the whole schedule, as on the Schedule tab. */
  number: number;
  involvesSelf: boolean;
  /** The own athlete's result, or any result of the race when no own athlete is marked. */
  hasResult: boolean;
};

export type NextRace =
  | { kind: "race"; raceId: string }
  /** Every race that counts has a result entered. */
  | { kind: "allDone" }
  | { kind: "noRaces" }
  /** There are races, but the own athlete is on none of them. */
  | { kind: "noneForSelf" };

export type TodayView = {
  version: typeof RACE_DAY_TODAY_VERSION;
  phase: EventPhase;
  /** The day whose races are listed; null after the event or when "today" is undetermined. */
  shownDay: DateString | null;
  races: TodayRace[];
  next: NextRace;
  /** Races with no day yet. They are never placed on a guessed day. */
  undatedRaceCount: number;
  /** Results still pending: the own athlete's, or all of them when no own athlete is marked. */
  pendingResultCount: number;
  scope: "self" | "all";
};

export type TodayInput = {
  event: Pick<RaceEvent, "dates" | "timeZone">;
  races: readonly RaceEntry[];
  results: readonly RaceResult[];
  /** The own athlete; the first by id when several are marked is the caller's decision. */
  self: Pick<RaceRosterEntry, "rosterId"> | null;
  /** ISO instant. */
  now: string;
};

function dayNumber(day: DateString): number {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

/** Where "now" falls against the event's days, in the event's own zone. */
export function eventPhase(
  event: Pick<RaceEvent, "dates" | "timeZone">,
  now: string,
): EventPhase {
  if (Number.isNaN(Date.parse(now))) {
    return { kind: "undetermined", reason: "badClock" };
  }
  const dates = [...new Set(event.dates)].sort();
  if (dates.length === 0) {
    return { kind: "undetermined", reason: "noDates" };
  }
  if (event.timeZone === null) {
    return { kind: "undetermined", reason: "noTimeZone" };
  }
  const zoned = instantToZonedDateTime(now, event.timeZone);
  if (!zoned) {
    return { kind: "undetermined", reason: "badTimeZone" };
  }
  const today = zoned.day;
  const first = dates[0] as DateString;
  const last = dates[dates.length - 1] as DateString;

  if (dates.includes(today)) {
    return { kind: "today", today };
  }
  if (today < first) {
    return { kind: "before", today, firstDay: first, daysUntil: dayNumber(first) - dayNumber(today) };
  }
  if (today > last) {
    return { kind: "after", today, lastDay: last };
  }
  const nextDay = dates.find((day) => day > today) as DateString;
  return { kind: "between", today, nextDay };
}

function shownDayOf(phase: EventPhase): DateString | null {
  switch (phase.kind) {
    case "today":
      return phase.today;
    case "before":
      return phase.firstDay;
    case "between":
      return phase.nextDay;
    default:
      return null;
  }
}

export function buildTodayView(input: TodayInput): TodayView {
  const phase = eventPhase(input.event, input.now);
  const shownDay = shownDayOf(phase);
  const sorted = sortRaceEntries(input.races);
  const raceIds = new Set(sorted.map((race) => race.raceId));
  const selfId = input.self?.rosterId ?? null;

  const resultsOfRace = new Map<string, RaceResult[]>();
  for (const result of input.results) {
    if (!raceIds.has(result.raceId)) {
      continue;
    }
    const list = resultsOfRace.get(result.raceId) ?? [];
    list.push(result);
    resultsOfRace.set(result.raceId, list);
  }

  const races: TodayRace[] = [];
  sorted.forEach((race, index) => {
    if (shownDay === null || race.day !== shownDay) {
      return;
    }
    const results = resultsOfRace.get(race.raceId) ?? [];
    races.push({
      race,
      number: index + 1,
      involvesSelf: selfId !== null && race.rosterIds.includes(selfId),
      hasResult: selfId !== null ? results.some((r) => r.rosterId === selfId) : results.length > 0,
    });
  });

  const counted = selfId !== null ? races.filter((r) => r.involvesSelf) : races;
  const open = counted.find((r) => !r.hasResult);
  const next: NextRace =
    races.length === 0
      ? { kind: "noRaces" }
      : counted.length === 0
        ? { kind: "noneForSelf" }
        : open
          ? { kind: "race", raceId: open.race.raceId }
          : { kind: "allDone" };

  const pendingResultCount = [...resultsOfRace.values()]
    .flat()
    .filter((result) => (selfId === null || result.rosterId === selfId) && !isConfirmed(result)).length;

  return {
    version: RACE_DAY_TODAY_VERSION,
    phase,
    shownDay,
    races,
    next,
    undatedRaceCount: sorted.filter((race) => race.day === null).length,
    pendingResultCount,
    scope: selfId !== null ? "self" : "all",
  };
}
