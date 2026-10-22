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
  /** Unused by the UX gate. The gate treats a PIN as set only when both hash and salt are present. */
  parentPinEnabled?: boolean;
  /** SHA-256 hex of `salt + PIN`. Never the PIN itself. See ADR-007. */
  parentPinHash?: string;
  /** Random hex salt that was prefixed to the PIN before hashing. */
  parentPinSalt?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** @deprecated Alias for UserSettings */
export type User = UserSettings;
