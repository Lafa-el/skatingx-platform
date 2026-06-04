import type { DateString, Timestamp } from "./common";

/**
 * Per-athlete gamification (`athletes/{athleteId}/gamification/main`).
 */
export interface Gamification {
  points: number;
  streakDays: number;
  completedDays: DateString[];
  /** Legacy training fields (optional until M4 migration) */
  pointsPerTask?: number;
  dailyBonusPoints?: number;
  updatedAt?: Timestamp;
}
