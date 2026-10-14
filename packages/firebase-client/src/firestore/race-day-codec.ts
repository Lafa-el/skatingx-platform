import {
  RACE_DAY_SCHEMA_VERSION,
  type RaceDayVerification,
  type RaceEntry,
  type RaceEvent,
  type RaceRosterEntry,
} from "@skatingx/schema";
import type {
  RaceEventInput,
  RaceInput,
  RosterEntryInput,
} from "@skatingx/skating-domain";
import {
  serverTimestamp,
  Timestamp as FirestoreTimestamp,
  type DocumentData,
} from "firebase/firestore";

/**
 * Race Day document codec (ADR-001 D5/D6).
 *
 * Write side: builds the exact key set `firestore.rules` demands (no more, no fewer keys,
 * unknown values as explicit `null`).
 * Read side: documents come from outside the type system, so they are validated before they
 * become business models. A document that does not validate is reported, never guessed at:
 * showing a corrupted "verified" mark would be worse than showing nothing.
 *
 * Firestore `Timestamp` stays inside this file; business models use ISO strings.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

// --- read helpers ---------------------------------------------------------------

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Duck-typed on `toDate()` rather than `instanceof`, so a second copy of the SDK
 * (tests, emulator tooling) cannot make valid data look invalid.
 */
function readInstant(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const toDate = (value as { toDate?: unknown }).toDate;
  if (typeof toDate !== "function") {
    return null;
  }
  const date: unknown = toDate.call(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

type CommonFields = {
  verification: RaceDayVerification;
  source: "manual";
  sourceNote: string;
  verifiedAt: string | null;
  schemaVersion: typeof RACE_DAY_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
};

function readCommon(raw: Raw): ParseResult<CommonFields> {
  if (raw.schemaVersion !== RACE_DAY_SCHEMA_VERSION) {
    return fail(`unsupported schemaVersion: ${String(raw.schemaVersion)}`);
  }
  const { verification } = raw;
  if (verification !== "pending" && verification !== "verified") {
    return fail("invalid verification value");
  }
  if (raw.source !== "manual") {
    return fail("invalid source");
  }
  if (typeof raw.sourceNote !== "string") {
    return fail("sourceNote is not a string");
  }
  const verifiedAt = raw.verifiedAt === null ? null : readInstant(raw.verifiedAt);
  if (verification === "verified" && verifiedAt === null) {
    return fail("verified without a valid verifiedAt");
  }
  if (verification === "pending" && raw.verifiedAt !== null) {
    return fail("pending with a verifiedAt");
  }
  const createdAt = readInstant(raw.createdAt);
  const updatedAt = readInstant(raw.updatedAt);
  if (createdAt === null || updatedAt === null) {
    return fail("missing createdAt or updatedAt");
  }
  return {
    ok: true,
    value: {
      verification,
      source: "manual",
      sourceNote: raw.sourceNote,
      verifiedAt,
      schemaVersion: RACE_DAY_SCHEMA_VERSION,
      createdAt,
      updatedAt,
    },
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}

// --- parsers (read) -------------------------------------------------------------

export function parseRaceEvent(id: string, data: unknown): ParseResult<RaceEvent> {
  if (!isRecord(data)) {
    return fail("document is not an object");
  }
  const common = readCommon(data);
  if (!common.ok) {
    return common;
  }
  const timeZone = nullableString(data.timeZone);
  const venue = nullableString(data.venue);
  if (
    data.eventId !== id ||
    typeof data.name !== "string" ||
    !isStringArray(data.dates) ||
    timeZone === undefined ||
    venue === undefined
  ) {
    return fail("event fields have the wrong shape");
  }
  return {
    ok: true,
    value: { ...common.value, eventId: id, name: data.name, dates: data.dates, timeZone, venue },
  };
}

export function parseRosterEntry(id: string, data: unknown): ParseResult<RaceRosterEntry> {
  if (!isRecord(data)) {
    return fail("document is not an object");
  }
  const common = readCommon(data);
  if (!common.ok) {
    return common;
  }
  const athleteRefId = nullableString(data.athleteRefId);
  if (
    data.rosterId !== id ||
    typeof data.displayName !== "string" ||
    typeof data.bib !== "string" ||
    typeof data.division !== "string" ||
    typeof data.isSelf !== "boolean" ||
    typeof data.isFollowed !== "boolean" ||
    athleteRefId === undefined
  ) {
    return fail("roster fields have the wrong shape");
  }
  return {
    ok: true,
    value: {
      ...common.value,
      rosterId: id,
      displayName: data.displayName,
      bib: data.bib,
      division: data.division,
      isSelf: data.isSelf,
      isFollowed: data.isFollowed,
      athleteRefId,
    },
  };
}

export function parseRaceEntry(id: string, data: unknown): ParseResult<RaceEntry> {
  if (!isRecord(data)) {
    return fail("document is not an object");
  }
  const common = readCommon(data);
  if (!common.ok) {
    return common;
  }
  const day = nullableString(data.day);
  const round = nullableString(data.round);
  const heat = nullableString(data.heat);
  const scheduledAt = data.scheduledAt === null ? null : readInstant(data.scheduledAt);
  if (
    data.raceId !== id ||
    typeof data.distanceId !== "string" ||
    typeof data.label !== "string" ||
    typeof data.sortOrder !== "number" ||
    !Number.isInteger(data.sortOrder) ||
    day === undefined ||
    round === undefined ||
    heat === undefined ||
    (data.scheduledAt !== null && scheduledAt === null) ||
    !isStringArray(data.rosterIds)
  ) {
    return fail("race fields have the wrong shape");
  }
  return {
    ok: true,
    value: {
      ...common.value,
      raceId: id,
      distanceId: data.distanceId,
      label: data.label,
      sortOrder: data.sortOrder,
      day,
      round,
      heat,
      scheduledAt,
      rosterIds: data.rosterIds,
    },
  };
}

// --- encoders (write) -----------------------------------------------------------

/**
 * Server time, not the device clock: a phone at the venue can have a wrong clock, and
 * verification and audit times must be comparable across devices.
 */
function createdAndUpdated(): DocumentData {
  return {
    schemaVersion: RACE_DAY_SCHEMA_VERSION,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function pendingFields(sourceNote: string): DocumentData {
  return { verification: "pending", source: "manual", sourceNote, verifiedAt: null };
}

/** Editing resets verification: the changed value has not been checked yet (ADR-001 D5). */
function editedFields(sourceNote: string): DocumentData {
  return { ...pendingFields(sourceNote), updatedAt: serverTimestamp() };
}

function toInstant(iso: string | null): FirestoreTimestamp | null {
  if (iso === null) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    // Inputs are normalized by the domain layer first; reaching this is a programming error.
    throw new Error(`Cannot encode invalid instant: "${iso}"`);
  }
  return FirestoreTimestamp.fromDate(date);
}

export function encodeVerification(verified: boolean): DocumentData {
  return verified
    ? { verification: "verified", verifiedAt: serverTimestamp(), updatedAt: serverTimestamp() }
    : { verification: "pending", verifiedAt: null, updatedAt: serverTimestamp() };
}

function eventFields(input: RaceEventInput): DocumentData {
  return {
    name: input.name,
    dates: input.dates,
    timeZone: input.timeZone,
    venue: input.venue,
  };
}

export function encodeRaceEventCreate(eventId: string, input: RaceEventInput): DocumentData {
  return {
    eventId,
    ...eventFields(input),
    ...pendingFields(input.sourceNote),
    ...createdAndUpdated(),
  };
}

export function encodeRaceEventUpdate(input: RaceEventInput): DocumentData {
  return { ...eventFields(input), ...editedFields(input.sourceNote) };
}

function rosterFields(input: RosterEntryInput): DocumentData {
  return {
    displayName: input.displayName,
    bib: input.bib,
    division: input.division,
    isSelf: input.isSelf,
    isFollowed: input.isFollowed,
    athleteRefId: input.athleteRefId,
  };
}

export function encodeRosterEntryCreate(rosterId: string, input: RosterEntryInput): DocumentData {
  return {
    rosterId,
    ...rosterFields(input),
    ...pendingFields(input.sourceNote),
    ...createdAndUpdated(),
  };
}

export function encodeRosterEntryUpdate(input: RosterEntryInput): DocumentData {
  return { ...rosterFields(input), ...editedFields(input.sourceNote) };
}

function raceFields(input: RaceInput): DocumentData {
  return {
    distanceId: input.distanceId,
    label: input.label,
    sortOrder: input.sortOrder,
    day: input.day,
    round: input.round,
    heat: input.heat,
    scheduledAt: toInstant(input.scheduledAt),
    rosterIds: input.rosterIds,
  };
}

export function encodeRaceCreate(raceId: string, input: RaceInput): DocumentData {
  return {
    raceId,
    ...raceFields(input),
    ...pendingFields(input.sourceNote),
    ...createdAndUpdated(),
  };
}

export function encodeRaceUpdate(input: RaceInput): DocumentData {
  return { ...raceFields(input), ...editedFields(input.sourceNote) };
}
