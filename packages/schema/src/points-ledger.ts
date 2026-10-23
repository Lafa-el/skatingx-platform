import type { DateString, Timestamp } from "./common";

/**
 * Append-only points events (`athletes/{athleteId}/pointsLedger/{eventId}`).
 * The document is never updated or deleted by the client. Rules still allow an
 * owner to do either, because this collection sits in the existing owner-writable
 * athlete depth and this slice does not change rules.
 */
export const POINTS_LEDGER_REASONS = [
  "task-complete",
  "task-uncomplete",
  "task-delete",
  "daily-bonus-add",
  "daily-bonus-remove",
  "plan-checkin",
  "plan-uncheckin",
  "reward-redeem",
  "history-delete",
  "opening-balance",
] as const;

export type PointsLedgerReason = (typeof POINTS_LEDGER_REASONS)[number];

/** Fixed id so the opening alignment can be repeated without a second event. */
export const POINTS_LEDGER_OPENING_ID = "opening";

export type PointsLedgerEvent = {
  dateId: DateString;
  /** Signed integer. The balance is the opening event plus every later delta. */
  delta: number;
  reason: PointsLedgerReason;
  /** Task id, check-in id, redemption id, or archived date. Omitted when none applies. */
  refId?: string;
  createdAt: Timestamp;
};
