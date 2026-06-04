import type { DateString, Timestamp } from "./common";
import type { Language } from "./language";

/**
 * Account-level settings (`users/{userId}/settings/main`).
 * One document per Firebase Auth user (typically parent/guardian).
 */
export interface User {
  activeAthleteId: string;
  language: Language;
  theme: string;
  parentPinHash?: string;
  isPro?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  /** Last calendar day the account was active (rollover hints). */
  lastActiveDate?: DateString;
}
