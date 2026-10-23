import type { PointsLedgerReason } from "@skatingx/schema";
import { planDayById, type PlanFocus } from "@skatingx/skating-domain";

import { isDateInMonth, type HistoryMonth } from "./history-model";

export const LEDGER_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type LedgerWeekday = (typeof LEDGER_WEEKDAYS)[number];

export type LedgerEvent = {
  readonly id: string;
  readonly dateId: string;
  readonly delta: number;
  readonly reason: PointsLedgerReason;
  readonly refId?: string;
  readonly createdAt: string;
};

export type LedgerDayGroup = {
  readonly dateId: string;
  readonly subtotal: number;
  readonly events: readonly LedgerEvent[];
};

export type PlanLedgerNote = {
  readonly focus: PlanFocus;
  readonly weekday: LedgerWeekday;
};

export type PointsReconciliation = {
  readonly points: number;
  /** Opening line. Zero when that document does not exist. */
  readonly opening: number;
  /** Aggregate sum minus the opening line: every later delta. */
  readonly net: number;
  /** `points - (opening + net)`. Zero when the balance matches the ledger. */
  readonly gap: number;
};

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Days of one month, oldest first. Events inside a day follow `createdAt`.
 * An opening line is included when its `dateId` falls in this month, and left
 * out of every other month.
 */
export function groupLedgerMonth(events: readonly LedgerEvent[], month: HistoryMonth): readonly LedgerDayGroup[] {
  const byDay = new Map<string, LedgerEvent[]>();
  for (const event of events) {
    if (!isDateInMonth(event.dateId, month)) continue;
    const day = byDay.get(event.dateId) ?? [];
    day.push(event);
    byDay.set(event.dateId, day);
  }
  return [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateId, day]) => {
      const ordered = [...day].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
      const subtotal = ordered.reduce((total, event) => total + event.delta, 0);
      return { dateId, subtotal, events: ordered };
    });
}

/**
 * Which plan day a check-in names, when `refId` is a template id. Anything else
 * stays unnamed: a task id or a redemption id is not turned into a title.
 */
export function planLedgerNote(reason: PointsLedgerReason, refId: string | undefined): PlanLedgerNote | null {
  if (reason !== "plan-checkin" && reason !== "plan-uncheckin") return null;
  if (!refId) return null;
  const day = planDayById(refId);
  if (!day) return null;
  const weekday = day.id.slice(day.id.lastIndexOf("_") + 1);
  if (!LEDGER_WEEKDAYS.includes(weekday as LedgerWeekday)) return null;
  return { focus: day.focus, weekday: weekday as LedgerWeekday };
}

/** Current points against the all-time aggregate. The gap is shown only when it is not zero. */
export function reconcilePoints(points: number, aggregate: number, opening: number): PointsReconciliation {
  const current = finite(points);
  const total = finite(aggregate);
  const openingDelta = finite(opening);
  return {
    points: current,
    opening: openingDelta,
    net: total - openingDelta,
    gap: current - total,
  };
}
