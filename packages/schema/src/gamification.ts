import type { DateString, Timestamp } from "./common";

/**
 * Per-athlete points and streak state (`athletes/{athleteId}/gamification/main`).
 * Canonical balance for shop redemptions and plan check-ins.
 */
export interface Gamification {
  points: number;
  pointsPerTask: number;
  dailyBonusPoints: number;
  /** Dates (YYYY-MM-DD) when all daily tasks were completed */
  completedDays: DateString[];
  updatedAt?: Timestamp;
}
