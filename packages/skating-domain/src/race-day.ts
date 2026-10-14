import type {
  DateString,
  RaceDayProvenance,
  RaceEntry,
  RaceResult,
  RaceResultStatus,
  RaceRosterEntry,
  Timestamp,
} from "@skatingx/schema";

/**
 * Pure Race Day logic (ADR-001). No Firestore, no React, no clock access: callers pass
 * the current time in, so every function here is deterministic and testable.
 */

// --- ids -------------------------------------------------------------------------

/**
 * Ids are lowercase letters, digits and hyphens. Underscore is excluded on purpose: it is the
 * separator in `createRaceResultId`, so a composed id can always be split back unambiguously.
 */
const RACE_DAY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;

export function isValidRaceDayId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_ID_LENGTH && RACE_DAY_ID_PATTERN.test(id);
}

/**
 * Deterministic result id: saving the same race and athlete twice updates one document
 * instead of creating a duplicate.
 */
export function createRaceResultId(raceId: string, rosterId: string): string {
  if (!isValidRaceDayId(raceId) || !isValidRaceDayId(rosterId)) {
    throw new Error(
      `Invalid race day id (allowed: lowercase letters, digits, hyphens): raceId="${raceId}", rosterId="${rosterId}"`,
    );
  }
  return `${raceId}_${rosterId}`;
}

// --- provenance ("待确认") ---------------------------------------------------------

/** Everything starts pending. There is no way to create already-verified data here. */
export function createPendingProvenance(sourceNote: string): RaceDayProvenance {
  return {
    verification: "pending",
    source: "manual",
    sourceNote: sourceNote.trim(),
    verifiedAt: null,
  };
}

export function markVerified<T extends RaceDayProvenance>(item: T, now: Timestamp): T {
  return { ...item, verification: "verified", verifiedAt: now };
}

/** Editing a verified value invalidates the verification: it must be checked again. */
export function markPending<T extends RaceDayProvenance>(item: T): T {
  return { ...item, verification: "pending", verifiedAt: null };
}

/**
 * Only verified data may be shown in a confirmed tone (for example "official result").
 * UI must branch on this, never on its own assumptions.
 */
export function isConfirmed(item: RaceDayProvenance): boolean {
  return item.verification === "verified";
}

export function countByVerification(items: readonly RaceDayProvenance[]): {
  pending: number;
  verified: number;
} {
  let verified = 0;
  for (const item of items) {
    if (isConfirmed(item)) {
      verified += 1;
    }
  }
  return { pending: items.length - verified, verified };
}

// --- results ---------------------------------------------------------------------

export type RaceResultInput = {
  status: RaceResultStatus;
  timeSeconds: number | null;
  place: number | null;
  advanced: boolean | null;
};

/** Error codes map to i18n keys in the UI (`raceDay.results.error.<code>`). */
export type RaceResultErrorCode =
  | "timeRequired"
  | "timeNotAllowed"
  | "timeInvalid"
  | "placeInvalid"
  | "placeNotAllowed"
  | "advancedNotAllowed";

const MAX_RACE_SECONDS = 60 * 30;

/**
 * A finished race needs a time; DNS/DNF/DQ must not carry a time, place or advancement.
 * Mirrors the data the Security Rules will accept, so bad data is rejected in the UI first.
 */
export function validateRaceResultInput(input: RaceResultInput): RaceResultErrorCode[] {
  const errors: RaceResultErrorCode[] = [];

  if (input.status === "finished") {
    if (input.timeSeconds === null) {
      errors.push("timeRequired");
    } else if (
      !Number.isFinite(input.timeSeconds) ||
      input.timeSeconds <= 0 ||
      input.timeSeconds > MAX_RACE_SECONDS
    ) {
      errors.push("timeInvalid");
    }
    if (
      input.place !== null &&
      (!Number.isInteger(input.place) || input.place < 1)
    ) {
      errors.push("placeInvalid");
    }
    return errors;
  }

  if (input.timeSeconds !== null) {
    errors.push("timeNotAllowed");
  }
  if (input.place !== null) {
    errors.push("placeNotAllowed");
  }
  if (input.advanced === true) {
    errors.push("advancedNotAllowed");
  }
  return errors;
}

// --- schedule ----------------------------------------------------------------------

function compareNullableLast<T>(
  a: T | null,
  b: T | null,
  compare: (x: T, y: T) => number,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

/**
 * Stable schedule order: known day first, then known time, then the explicit `sortOrder`
 * (so two 500m races with no times stay in the order they were entered), then label.
 * Unknown (null) values sort last and are never filled in.
 */
export function sortRaceEntries(races: readonly RaceEntry[]): RaceEntry[] {
  return [...races].sort((a, b) => {
    const day = compareNullableLast(a.day, b.day, (x, y) => x.localeCompare(y));
    if (day !== 0) return day;
    const time = compareNullableLast(a.scheduledAt, b.scheduledAt, (x, y) =>
      x.localeCompare(y),
    );
    if (time !== 0) return time;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
}

export type RaceDayGroup = {
  /** `null` groups the races whose day is not known yet. */
  day: DateString | null;
  races: RaceEntry[];
};

export function groupRaceEntriesByDay(races: readonly RaceEntry[]): RaceDayGroup[] {
  const groups: RaceDayGroup[] = [];
  for (const race of sortRaceEntries(races)) {
    const last = groups[groups.length - 1];
    if (last && last.day === race.day) {
      last.races.push(race);
    } else {
      groups.push({ day: race.day, races: [race] });
    }
  }
  return groups;
}

// --- summary ---------------------------------------------------------------------

/** Bump when the shape or rules of `buildRaceSummary` change, so old results stay explainable. */
export const RACE_SUMMARY_VERSION = "race-summary/1";

export type RaceSummaryInput = {
  self: Pick<RaceRosterEntry, "rosterId" | "displayName" | "bib" | "division">;
  races: readonly RaceEntry[];
  results: readonly RaceResult[];
  /** Personal best seconds by `distanceId`, if available. Context only; never auto-written. */
  personalBestSecondsByDistanceId?: Readonly<Record<string, number>>;
};

export type RaceSummaryItem = {
  raceId: string;
  label: string;
  /** `null` means no result has been entered for this race yet. */
  status: RaceResultStatus | null;
  timeSeconds: number | null;
  place: number | null;
  advanced: boolean | null;
  confirmed: boolean;
  /** Result minus PB in seconds (negative = faster). Only for finished races with a known PB. */
  deltaToPersonalBestSeconds: number | null;
};

export type RaceSummary = {
  summaryVersion: typeof RACE_SUMMARY_VERSION;
  athlete: { displayName: string; bib: string; division: string };
  items: RaceSummaryItem[];
  racesTotal: number;
  racesWithResult: number;
  racesFinished: number;
  /** Results still marked 待确认. The card must show this prominently. */
  pendingResultCount: number;
  /** Fastest finished time among CONFIRMED results only; `null` if none are confirmed. */
  fastestConfirmedSeconds: number | null;
};

/**
 * Factual comparison only: times, places, advancement and how much is still unverified.
 * It makes no coaching, medical or biomechanical claim (ADR-001 D6).
 */
export function buildRaceSummary(input: RaceSummaryInput): RaceSummary {
  const resultByRaceId = new Map<string, RaceResult>();
  for (const result of input.results) {
    if (result.rosterId === input.self.rosterId) {
      resultByRaceId.set(result.raceId, result);
    }
  }

  const items: RaceSummaryItem[] = sortRaceEntries(input.races)
    .filter((race) => race.rosterIds.includes(input.self.rosterId))
    .map((race) => {
      const result = resultByRaceId.get(race.raceId);
      const pb = input.personalBestSecondsByDistanceId?.[race.distanceId];
      const finishedTime =
        result?.status === "finished" ? result.timeSeconds : null;
      return {
        raceId: race.raceId,
        label: race.label,
        status: result?.status ?? null,
        timeSeconds: result?.timeSeconds ?? null,
        place: result?.place ?? null,
        advanced: result?.advanced ?? null,
        confirmed: result ? isConfirmed(result) : false,
        deltaToPersonalBestSeconds:
          finishedTime !== null && pb !== undefined
            ? Math.round((finishedTime - pb) * 1000) / 1000
            : null,
      };
    });

  const ownResults = items.filter((item) => item.status !== null);
  const confirmedFinished = items
    .filter(
      (item) =>
        item.confirmed && item.status === "finished" && item.timeSeconds !== null,
    )
    .map((item) => item.timeSeconds as number);

  return {
    summaryVersion: RACE_SUMMARY_VERSION,
    athlete: {
      displayName: input.self.displayName,
      bib: input.self.bib,
      division: input.self.division,
    },
    items,
    racesTotal: items.length,
    racesWithResult: ownResults.length,
    racesFinished: items.filter((item) => item.status === "finished").length,
    pendingResultCount: ownResults.filter((item) => !item.confirmed).length,
    fastestConfirmedSeconds:
      confirmedFinished.length > 0 ? Math.min(...confirmedFinished) : null,
  };
}
