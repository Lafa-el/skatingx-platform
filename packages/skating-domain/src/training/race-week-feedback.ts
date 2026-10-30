import type { DateString, RaceEvent } from "@skatingx/schema";

import { isRealDateString } from "../calendar-date";
import type { RaceWeekFeedback } from "./analysis-feedback";
import type { PlanFocus } from "./plan-template";
import { mondayOfWeek } from "./plan-tasks";

/**
 * Race week -> focus suggestion (docs/design/race-day-linkages.md 2.c). Pure: "today" is an argument
 * and nothing here reads or writes data. The card is derived on every render and never stored, so
 * it disappears by itself once the last race day has passed or the plan week has turned.
 *
 * "Today" is the device's calendar day, because the plan week is the device's week
 * (`usePlanFocus` compares with `mondayOfWeek(todayDateString())`). The event's own time zone is not used.
 */

export type RaceWeekEvent = Pick<RaceEvent, "eventId" | "name" | "dates" | "verification">;

/** Code-unit order, so the same ids sort the same way on every device and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The codec only checks that `dates` is a string array, so anything that is not a real calendar
 * day is dropped here. An event with no valid day never triggers a card.
 */
function validDays(dates: readonly string[]): DateString[] {
  return [...new Set(dates.filter(isRealDateString))].sort(compareText);
}

/**
 * At most one card. An event triggers it when all of these hold: its first valid day is in the same
 * plan week (Monday to Sunday) as today, today is not after its last valid day, and the week's focus
 * is not already `endurance`. When several events qualify, the one that starts first wins (ties by eventId).
 *
 * `currentFocus` is the focus chosen for this week, or null when none is. A caller that does not yet
 * know it (still loading) must not call this: null would read as "nothing chosen".
 */
export function deriveRaceWeekFeedback(
  events: readonly RaceWeekEvent[],
  today: DateString,
  currentFocus: PlanFocus | null,
): readonly RaceWeekFeedback[] {
  if (currentFocus === "endurance" || !isRealDateString(today)) {
    return [];
  }
  const thisWeek = mondayOfWeek(today);

  const candidates: { event: RaceWeekEvent; firstDay: DateString; lastDay: DateString }[] = [];
  for (const event of events) {
    const days = validDays(event.dates);
    const firstDay = days[0];
    const lastDay = days[days.length - 1];
    if (firstDay === undefined || lastDay === undefined) continue;
    if (mondayOfWeek(firstDay) !== thisWeek) continue;
    if (today > lastDay) continue;
    candidates.push({ event, firstDay, lastDay });
  }

  candidates.sort(
    (a, b) => compareText(a.firstDay, b.firstDay) || compareText(a.event.eventId, b.event.eventId),
  );
  const chosen = candidates[0];
  if (!chosen) {
    return [];
  }
  return [
    {
      type: "set-focus",
      focus: "endurance",
      sourceKind: "race",
      eventId: chosen.event.eventId,
      eventName: chosen.event.name,
      firstDay: chosen.firstDay,
      lastDay: chosen.lastDay,
      datesPending: chosen.event.verification === "pending",
    },
  ];
}
