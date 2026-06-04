import type { Timestamp } from "./common";
import type { Language } from "./language";

/**
 * Account-level settings (`users/{userId}/settings/main`).
 */
export interface UserSettings {
  activeAthleteId: string;
  language: Language;
  theme: string;
  parentPinHash?: string;
  isPro?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** @deprecated Alias for UserSettings */
export type User = UserSettings;
