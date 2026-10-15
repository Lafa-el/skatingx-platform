import type { DateString, RaceResultStatus } from "@skatingx/schema";

import { isValidRaceDayId } from "./race-day";

/**
 * Input normalization and validation for Race Day entry forms (ADR-001 D5/D6).
 *
 * The limits below mirror `firestore.rules` on purpose: Security Rules are the enforced
 * boundary, this module gives forms and the repository the same answer *before* a write
 * is rejected. If one side changes, change both (the rules tests and these tests pin them).
 *
 * Pure functions: no Firestore, no React, no clock.
 */

export const RACE_DAY_LIMITS = {
  eventName: 120,
  venue: 200,
  timeZone: 64,
  eventDatesMax: 10,
  displayName: 120,
  bib: 16,
  division: 80,
  athleteRefId: 64,
  distanceId: 32,
  raceLabel: 80,
  sortOrderMax: 999,
  roundOrHeat: 40,
  rosterIdsMax: 50,
  /** A race result time is above 0 and at most this many seconds (30 minutes). */
  resultTimeMaxSeconds: 1800,
  sourceNote: 500,
} as const;

/** Error codes are stable keys; the UI maps them to localized messages (i18n). */
export type RaceDayInputErrorCode =
  | "required"
  | "tooLong"
  | "tooMany"
  | "invalidFormat"
  | "outOfRange"
  | "duplicate"
  // Race result entry (see `prepareRaceResultInput`)
  | "statusInvalid"
  | "timeRequired"
  | "timeInvalid"
  | "timeDecimals"
  | "timeNotAllowed"
  | "placeInvalid"
  | "placeNotAllowed"
  | "advancedNotAllowed";

export type RaceDayInputError = { field: string; code: RaceDayInputErrorCode };

/**
 * `value` is always the best-effort normalized input; it is only safe to write when
 * `errors` is empty.
 */
export type PreparedInput<T> = { value: T; errors: RaceDayInputError[] };

// --- shared helpers -------------------------------------------------------------

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for real calendar days: "2026-02-30" is rejected, not rolled over. */
export function isRealDateString(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** IANA zone names are validated by the runtime's own database, not by a hand-kept list. */
function isKnownTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    // RangeError means "unknown zone": that is the answer, not a failure to report.
    return false;
  }
}

/**
 * An instant must be unambiguous: it needs "Z" or an explicit offset. A bare local time
 * would silently depend on the device zone, which is exactly the assumption ADR-001 forbids.
 */
const INSTANT_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function normalizeInstant(value: string): string | null {
  if (!INSTANT_WITH_OFFSET.test(value)) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function requiredText(
  raw: string,
  field: string,
  max: number,
  errors: RaceDayInputError[],
): string {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    errors.push({ field, code: "required" });
  } else if (value.length > max) {
    errors.push({ field, code: "tooLong" });
  }
  return value;
}

/** Empty or whitespace-only becomes `null`: unknown is stored as null, never as "". */
function optionalText(
  raw: string | null | undefined,
  field: string,
  max: number,
  errors: RaceDayInputError[],
): string | null {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    return null;
  }
  if (value.length > max) {
    errors.push({ field, code: "tooLong" });
  }
  return value;
}

function sourceNoteText(raw: string, errors: RaceDayInputError[]): string {
  const value = (raw ?? "").trim();
  if (value.length > RACE_DAY_LIMITS.sourceNote) {
    errors.push({ field: "sourceNote", code: "tooLong" });
  }
  return value;
}

// --- event ----------------------------------------------------------------------

export type RaceEventInput = {
  name: string;
  dates: DateString[];
  timeZone: string | null;
  venue: string | null;
  sourceNote: string;
};

export function prepareRaceEventInput(input: RaceEventInput): PreparedInput<RaceEventInput> {
  const errors: RaceDayInputError[] = [];

  const name = requiredText(input.name, "name", RACE_DAY_LIMITS.eventName, errors);
  const venue = optionalText(input.venue, "venue", RACE_DAY_LIMITS.venue, errors);
  const sourceNote = sourceNoteText(input.sourceNote, errors);

  const timeZone = optionalText(input.timeZone, "timeZone", RACE_DAY_LIMITS.timeZone, errors);
  if (timeZone !== null && !isKnownTimeZone(timeZone)) {
    errors.push({ field: "timeZone", code: "invalidFormat" });
  }

  const dates = (input.dates ?? []).map((d) => (d ?? "").trim());
  if (dates.length === 0) {
    errors.push({ field: "dates", code: "required" });
  } else if (dates.length > RACE_DAY_LIMITS.eventDatesMax) {
    errors.push({ field: "dates", code: "tooMany" });
  }
  if (dates.some((d) => !isRealDateString(d))) {
    errors.push({ field: "dates", code: "invalidFormat" });
  }
  if (new Set(dates).size !== dates.length) {
    errors.push({ field: "dates", code: "duplicate" });
  }

  return {
    value: { name, dates: [...dates].sort(), timeZone, venue, sourceNote },
    errors,
  };
}

// --- roster ---------------------------------------------------------------------

export type RosterEntryInput = {
  displayName: string;
  bib: string;
  division: string;
  isSelf: boolean;
  isFollowed: boolean;
  athleteRefId: string | null;
  sourceNote: string;
};

export function prepareRosterEntryInput(
  input: RosterEntryInput,
): PreparedInput<RosterEntryInput> {
  const errors: RaceDayInputError[] = [];

  const displayName = requiredText(
    input.displayName,
    "displayName",
    RACE_DAY_LIMITS.displayName,
    errors,
  );
  const bib = requiredText(input.bib, "bib", RACE_DAY_LIMITS.bib, errors);
  const division = requiredText(input.division, "division", RACE_DAY_LIMITS.division, errors);
  const athleteRefId = optionalText(
    input.athleteRefId,
    "athleteRefId",
    RACE_DAY_LIMITS.athleteRefId,
    errors,
  );
  const sourceNote = sourceNoteText(input.sourceNote, errors);

  return {
    value: {
      displayName,
      bib,
      division,
      isSelf: input.isSelf === true,
      isFollowed: input.isFollowed === true,
      athleteRefId,
      sourceNote,
    },
    errors,
  };
}

// --- race (schedule entry) --------------------------------------------------------

export type RaceInput = {
  distanceId: string;
  label: string;
  sortOrder: number;
  day: DateString | null;
  round: string | null;
  heat: string | null;
  /** ISO 8601 instant with "Z" or an explicit offset; `null` while the time is unknown. */
  scheduledAt: string | null;
  rosterIds: string[];
  sourceNote: string;
};

export function prepareRaceInput(input: RaceInput): PreparedInput<RaceInput> {
  const errors: RaceDayInputError[] = [];

  const distanceId = requiredText(
    input.distanceId,
    "distanceId",
    RACE_DAY_LIMITS.distanceId,
    errors,
  );
  const label = requiredText(input.label, "label", RACE_DAY_LIMITS.raceLabel, errors);
  const round = optionalText(input.round, "round", RACE_DAY_LIMITS.roundOrHeat, errors);
  const heat = optionalText(input.heat, "heat", RACE_DAY_LIMITS.roundOrHeat, errors);
  const sourceNote = sourceNoteText(input.sourceNote, errors);

  if (
    !Number.isInteger(input.sortOrder) ||
    input.sortOrder < 0 ||
    input.sortOrder > RACE_DAY_LIMITS.sortOrderMax
  ) {
    errors.push({ field: "sortOrder", code: "outOfRange" });
  }

  const dayRaw = optionalText(input.day, "day", 10, errors);
  if (dayRaw !== null && !isRealDateString(dayRaw)) {
    errors.push({ field: "day", code: "invalidFormat" });
  }

  let scheduledAt: string | null = null;
  const scheduledRaw = (input.scheduledAt ?? "").trim();
  if (scheduledRaw.length > 0) {
    scheduledAt = normalizeInstant(scheduledRaw);
    if (scheduledAt === null) {
      errors.push({ field: "scheduledAt", code: "invalidFormat" });
    }
  }

  const rosterIds = (input.rosterIds ?? []).map((id) => (id ?? "").trim());
  if (rosterIds.length > RACE_DAY_LIMITS.rosterIdsMax) {
    errors.push({ field: "rosterIds", code: "tooMany" });
  }
  if (rosterIds.some((id) => !isValidRaceDayId(id))) {
    errors.push({ field: "rosterIds", code: "invalidFormat" });
  }
  if (new Set(rosterIds).size !== rosterIds.length) {
    errors.push({ field: "rosterIds", code: "duplicate" });
  }

  return {
    value: {
      distanceId,
      label,
      sortOrder: input.sortOrder,
      day: dayRaw,
      round,
      heat,
      scheduledAt,
      rosterIds,
      sourceNote,
    },
    errors,
  };
}

// --- entity ids -------------------------------------------------------------------

const SUFFIX_PATTERN = /^[a-z0-9]{4,12}$/;
const MAX_SLUG_LENGTH = 40;

/** Random lowercase base-36 suffix. Not a secret: it only avoids id collisions. */
export function createIdSuffix(random: () => number = Math.random, length = 6): string {
  let out = "";
  while (out.length < length) {
    out += Math.floor(random() * 36).toString(36);
  }
  return out;
}

/**
 * Readable, valid Race Day id from a label, e.g. "Super 1500m" -> "super-1500m-k3x9a2".
 * Labels with no ASCII letters or digits (for example Chinese names) use "item" as the base:
 * ids stay ASCII so they are valid in paths and rules, and names live in the document fields.
 */
export function createRaceDayEntityId(label: string, suffix: string): string {
  if (!SUFFIX_PATTERN.test(suffix)) {
    throw new Error(`Invalid id suffix (expected 4-12 lowercase letters or digits): "${suffix}"`);
  }
  const slug = (label ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return `${slug || "item"}-${suffix}`;
}

// --- race result ---------------------------------------------------------------------

/**
 * Result times are stored in seconds with at most 3 decimals (milliseconds). Security Rules only
 * check "a number above 0 and at most 1800" because rules cannot express decimal places reliably,
 * so this module (on write) and the codec (on read) are what keep every stored time to 3 decimals.
 */
export const RESULT_TIME_MAX_DECIMALS = 3;

/** Sanity bound for a typed place; not a rules limit. */
export const RACE_RESULT_PLACE_MAX = 999;

const RESULT_STATUSES: readonly RaceResultStatus[] = ["finished", "DNS", "DNF", "DQ"];

// "m:ss(.fff)" or plain seconds "s(.fff)". Comma decimals are rejected on purpose: they are
// ambiguous with thousands separators in some locales, and a wrong time must not be saved quietly.
const RESULT_TIME_PATTERN = /^(?:(\d{1,2}):(\d{1,2})|(\d{1,4}))(?:\.(\d+))?$/;

export type ParsedResultTime =
  | { ok: true; seconds: number }
  | { ok: false; code: "timeInvalid" | "timeDecimals" };

/**
 * Strict race-time parser for results. Unlike the lenient PB parser it rejects what is almost
 * certainly a typo: "1:75.00" (seconds must be below 60), "1:30:00", more than 3 decimals, and
 * anything over 30 minutes. It works in integer milliseconds so "49.123" is exact, not 49.12299999.
 */
export function parseResultTime(input: string): ParsedResultTime {
  const match = RESULT_TIME_PATTERN.exec((input ?? "").trim());
  if (!match) {
    return { ok: false, code: "timeInvalid" };
  }
  const [, minutesText, secondsInMinuteText, plainSecondsText, fraction = ""] = match;
  if (fraction.length > RESULT_TIME_MAX_DECIMALS) {
    return { ok: false, code: "timeDecimals" };
  }

  let wholeSeconds: number;
  if (minutesText !== undefined && secondsInMinuteText !== undefined) {
    const secondsInMinute = Number(secondsInMinuteText);
    if (secondsInMinute >= 60) {
      return { ok: false, code: "timeInvalid" };
    }
    wholeSeconds = Number(minutesText) * 60 + secondsInMinute;
  } else {
    wholeSeconds = Number(plainSecondsText);
  }

  const milliseconds = wholeSeconds * 1000 + Number(fraction.padEnd(RESULT_TIME_MAX_DECIMALS, "0"));
  if (milliseconds <= 0 || milliseconds > RACE_DAY_LIMITS.resultTimeMaxSeconds * 1000) {
    return { ok: false, code: "timeInvalid" };
  }
  return { ok: true, seconds: milliseconds / 1000 };
}

/**
 * Display form that never hides what was entered: two decimals normally ("49.80"), three only
 * when the third is not zero ("49.123"). Parsing the output gives back the same seconds.
 */
export function formatResultTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--";
  }
  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const remainderMs = totalMs % 60000;
  const wholeSeconds = Math.floor(remainderMs / 1000);
  let fraction = String(remainderMs % 1000).padStart(3, "0");
  if (fraction.endsWith("0")) {
    fraction = fraction.slice(0, 2);
  }
  const secondsText = minutes > 0 ? String(wholeSeconds).padStart(2, "0") : String(wholeSeconds);
  return `${minutes > 0 ? `${String(minutes)}:` : ""}${secondsText}.${fraction}`;
}

/** What the result form hands over: raw text for the time and place. */
export type RaceResultFormInput = {
  status: string;
  time: string;
  place: string;
  advanced: boolean | null;
  sourceNote: string;
};

/** What is written: parsed numbers, consistent with the status. */
export type RaceResultWriteInput = {
  status: RaceResultStatus;
  timeSeconds: number | null;
  place: number | null;
  advanced: boolean | null;
  sourceNote: string;
};

/**
 * A finished race needs a time; DNS/DNF/DQ carry no time or place and cannot be "advanced".
 * Mirrors `validResult` in firestore.rules and `validateRaceResultInput`, so a bad combination is
 * explained in the form instead of being refused by the server.
 */
export function prepareRaceResultInput(input: RaceResultFormInput): PreparedInput<RaceResultWriteInput> {
  const errors: RaceDayInputError[] = [];
  const sourceNote = sourceNoteText(input.sourceNote, errors);

  const status = RESULT_STATUSES.find((s) => s === input.status);
  if (status === undefined) {
    errors.push({ field: "status", code: "statusInvalid" });
  }
  const effectiveStatus: RaceResultStatus = status ?? "finished";

  const timeText = (input.time ?? "").trim();
  const placeText = (input.place ?? "").trim();
  let timeSeconds: number | null = null;
  let place: number | null = null;
  let advanced: boolean | null = input.advanced === true ? true : input.advanced === false ? false : null;

  if (effectiveStatus === "finished") {
    if (timeText === "") {
      errors.push({ field: "time", code: "timeRequired" });
    } else {
      const parsed = parseResultTime(timeText);
      if (parsed.ok) {
        timeSeconds = parsed.seconds;
      } else {
        errors.push({ field: "time", code: parsed.code });
      }
    }
    if (placeText !== "") {
      const value = /^\d{1,4}$/.test(placeText) ? Number(placeText) : NaN;
      if (Number.isInteger(value) && value >= 1 && value <= RACE_RESULT_PLACE_MAX) {
        place = value;
      } else {
        errors.push({ field: "place", code: "placeInvalid" });
      }
    }
  } else {
    if (timeText !== "") {
      errors.push({ field: "time", code: "timeNotAllowed" });
    }
    if (placeText !== "") {
      errors.push({ field: "place", code: "placeNotAllowed" });
    }
    if (advanced === true) {
      errors.push({ field: "advanced", code: "advancedNotAllowed" });
      advanced = null;
    }
  }

  return {
    value: { status: effectiveStatus, timeSeconds, place, advanced, sourceNote },
    errors,
  };
}
