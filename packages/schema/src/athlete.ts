import type { DateString, LegacySource, Timestamp } from "./common";

/** Stable athlete key under `users/{userId}/athletes/{athleteId}`. */
export type AthleteId = string;

/**
 * Athlete profile (`athletes/{athleteId}/profile/main`).
 */
export interface Athlete {
  athleteId: AthleteId;
  displayName: string;
  /** ISO date YYYY-MM-DD */
  birthDate: DateString;
  /** Cached US Speedskating division label */
  skatingDivision?: string;
  /** Cloud Storage object path, not a data URL */
  avatarStoragePath?: string;
  legacySource?: LegacySource;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
