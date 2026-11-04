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
  /** First day on the ice. Optional until a profile editor writes it. */
  skatingStartDate?: DateString;
  sport: string;
  country: string;
  /** Written when the profile is created. Older profiles are backfilled in the console. */
  userId?: string;
  /** Short note. Optional. The editor allows at most 500 characters. */
  bio?: string;
  skatingDivision?: string;
  avatarStoragePath?: string;
  legacySource?: LegacySource;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** @deprecated Use AthleteProfile */
export type Athlete = AthleteProfile;
