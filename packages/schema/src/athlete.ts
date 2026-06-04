import type { DateString, LegacySource, Timestamp } from "./common";

export type AthleteId = string;

/**
 * Athlete profile (`athletes/{athleteId}/profile/main`).
 */
export interface AthleteProfile {
  athleteId: AthleteId;
  /** Display name (UI label: Name) */
  displayName: string;
  birthDate: DateString;
  sport: string;
  country: string;
  skatingDivision?: string;
  avatarStoragePath?: string;
  legacySource?: LegacySource;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** @deprecated Use AthleteProfile */
export type Athlete = AthleteProfile;
