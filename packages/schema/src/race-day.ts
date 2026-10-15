import type { DateString, Timestamp } from "./common";

/**
 * Race Day Companion (Phase 0) document types. See docs/adr/ADR-001-race-day-phase0.md D5/D6.
 *
 * Instants are ISO 8601 strings here, matching the rest of this package. The Firestore
 * repository maps them to Firestore `Timestamp` at the boundary, so SDK types never leak
 * into business models (AGENTS.md "Architecture").
 *
 * Fields that are not known are `null`, never guessed.
 */

export const RACE_DAY_SCHEMA_VERSION = 1 as const;

/** "pending" renders as 待确认 / Pending. Everything starts pending (ADR-001 D5). */
export type RaceDayVerification = "pending" | "verified";

export type RaceDayDataSource = "manual";

export interface RaceDayProvenance {
  verification: RaceDayVerification;
  source: RaceDayDataSource;
  /** Where the value came from, e.g. which roster document. Free text, never a secret. */
  sourceNote: string;
  /** Set only when `verification === "verified"`. */
  verifiedAt: Timestamp | null;
}

export interface RaceDayAudit {
  schemaVersion: typeof RACE_DAY_SCHEMA_VERSION;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** `raceDay/{eventId}` */
export interface RaceEvent extends RaceDayProvenance, RaceDayAudit {
  eventId: string;
  name: string;
  /** Calendar days of the event, e.g. ["2026-10-24", "2026-10-25"]. */
  dates: DateString[];
  /** IANA zone. Unknown until confirmed, so nullable; never assumed. */
  timeZone: string | null;
  venue: string | null;
}

/** `raceDay/{eventId}/roster/{rosterId}` — athletes in the event, including the user's own. */
export interface RaceRosterEntry extends RaceDayProvenance, RaceDayAudit {
  rosterId: string;
  displayName: string;
  bib: string;
  division: string;
  isSelf: boolean;
  isFollowed: boolean;
  /** Links the user's own athlete (for example "lindsay"); null for followed athletes. */
  athleteRefId: string | null;
}

/** `raceDay/{eventId}/races/{raceId}` — one scheduled race or heat. */
export interface RaceEntry extends RaceDayProvenance, RaceDayAudit {
  raceId: string;
  distanceId: string;
  /** Display label, for example "Super 1500m". */
  label: string;
  /** Position within the event for stable ordering when times are unknown (two 500m races). */
  sortOrder: number;
  day: DateString | null;
  round: string | null;
  heat: string | null;
  scheduledAt: Timestamp | null;
  rosterIds: string[];
}

export type RaceResultStatus = "finished" | "DNS" | "DNF" | "DQ";

/** `raceDay/{eventId}/results/{raceId}_{rosterId}` — deterministic id, see `createRaceResultId`. */
export interface RaceResult extends RaceDayProvenance, RaceDayAudit {
  resultId: string;
  raceId: string;
  rosterId: string;
  status: RaceResultStatus;
  /**
   * Seconds, same unit as `TimeEntry`, with at most 3 decimals (milliseconds, enforced by the domain
   * layer and the codec; rules only bound the range). Present only when `status === "finished"`.
   */
  timeSeconds: number | null;
  place: number | null;
  advanced: boolean | null;
}

/**
 * `raceDay/{eventId}/videos/{videoId}` — metadata only.
 * Collection is not analysis and nothing is uploaded (ADR-001 D4).
 */
export interface RaceVideoRef extends RaceDayAudit {
  videoId: string;
  raceId: string;
  rosterId: string;
  label: string;
  externalUrl: string | null;
  storedWhere: string | null;
  note: string | null;
}

/** `raceDay/{eventId}/summaries/main` — user-entered part of the summary card. */
export interface RaceSummaryDoc extends RaceDayAudit {
  summaryVersion: string;
  generatedAt: Timestamp | null;
  coachNote: string | null;
}
