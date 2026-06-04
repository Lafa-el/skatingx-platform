import type { Timestamp } from "./common";
import type { Language } from "./language";

/**
 * Account-level settings (`users/{userId}/settings/main`).
 */
export interface UserSettings {
  activeAthleteId: string;
  language: Language;
  theme: string;
  /** Manual dev flag — no payment integration in M6 */
  isPro?: boolean;
  /** Whether parent lock is configured (hash not stored until PIN security ships) */
  parentPinEnabled?: boolean;
  parentPinHash?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** @deprecated Alias for UserSettings */
export type User = UserSettings;
