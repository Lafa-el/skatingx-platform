import {
  RACE_DAY_SCHEMA_VERSION,
  type RaceDayVerification,
  type RaceEntry,
  type RaceEvent,
  type RaceResult,
  type RaceRosterEntry,
  type RaceSummaryDoc,
  type RaceVideoRef,
} from "@skatingx/schema";
import {
  checkExternalUrl,
  RACE_DAY_LIMITS,
  RACE_SUMMARY_VERSION,
  RESULT_TIME_MAX_DECIMALS,
  type RaceEventInput,
  type RaceInput,
  type RaceResultWriteInput,
  type RaceSummaryNoteInput,
  type RaceVideoInput,
  type RosterEntryInput,
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

const RESULT_STATUSES = ["finished", "DNS", "DNF", "DQ"] as const;

/** True when the value has no digit past the third decimal (tolerates float representation). */
function hasAtMostResultDecimals(seconds: number): boolean {
  const scale = 10 ** RESULT_TIME_MAX_DECIMALS;
  return Math.abs(seconds * scale - Math.round(seconds * scale)) < 1e-6;
}

/**
 * Mirrors `validResult` in firestore.rules, plus what rules cannot express (at most 3 decimals).
 * A result that fails is hidden and counted: showing a wrong time as if it were a race result
 * would be worse than showing nothing.
 */
export function parseRaceResult(id: string, data: unknown): ParseResult<RaceResult> {
  if (!isRecord(data)) {
    return fail("document is not an object");
  }
  const common = readCommon(data);
  if (!common.ok) {
    return common;
  }
  const { raceId, rosterId, status, timeSeconds, place, advanced } = data;
  if (
    typeof raceId !== "string" ||
    typeof rosterId !== "string" ||
    data.resultId !== id ||
    id !== `${raceId}_${rosterId}`
  ) {
    return fail("result ids do not match the document id");
  }
  const knownStatus = RESULT_STATUSES.find((s) => s === status);
  if (knownStatus === undefined) {
    return fail("invalid status");
  }
  if (place !== null && !(typeof place === "number" && Number.isInteger(place) && place >= 1)) {
    return fail("invalid place");
  }
  if (advanced !== null && typeof advanced !== "boolean") {
    return fail("invalid advanced");
  }
  if (knownStatus === "finished") {
    if (
      typeof timeSeconds !== "number" ||
      !Number.isFinite(timeSeconds) ||
      timeSeconds <= 0 ||
      timeSeconds > RACE_DAY_LIMITS.resultTimeMaxSeconds
    ) {
      return fail("finished result without a valid time");
    }
    if (!hasAtMostResultDecimals(timeSeconds)) {
      return fail("time has more than three decimals");
    }
  } else if (timeSeconds !== null || place !== null || advanced === true) {
    return fail("result that was not finished carries a time, place or advancement");
  }
  return {
    ok: true,
    value: {
      ...common.value,
      resultId: id,
      raceId,
      rosterId,
      status: knownStatus,
      timeSeconds: knownStatus === "finished" ? (timeSeconds as number) : null,
      place,
      advanced,
    },
  };
}

/**
 * Video metadata carries audit fields but no provenance: `validVideo` in firestore.rules has no
 * `verification` key, because a video record is the user's own pointer, not an event fact.
 */
function readAudit(raw: Raw): ParseResult<Pick<RaceVideoRef, "schemaVersion" | "createdAt" | "updatedAt">> {
  if (raw.schemaVersion !== RACE_DAY_SCHEMA_VERSION) {
    return fail(`unsupported schemaVersion: ${String(raw.schemaVersion)}`);
  }
  const createdAt = readInstant(raw.createdAt);
  const updatedAt = readInstant(raw.updatedAt);
  if (createdAt === null || updatedAt === null) {
    return fail("missing createdAt or updatedAt");
  }
  return { ok: true, value: { schemaVersion: RACE_DAY_SCHEMA_VERSION, createdAt, updatedAt } };
}

function boundedNullableString(value: unknown, max: number): string | null | undefined {
  const text = nullableString(value);
  return text !== undefined && text !== null && text.length > max ? undefined : text;
}

export function parseRaceVideo(id: string, data: unknown): ParseResult<RaceVideoRef> {
  if (!isRecord(data)) {
    return fail("document is not an object");
  }
  const audit = readAudit(data);
  if (!audit.ok) {
    return audit;
  }
  const { raceId, rosterId, label } = data;
  const externalUrl = boundedNullableString(data.externalUrl, RACE_DAY_LIMITS.videoExternalUrl);
  const storedWhere = boundedNullableString(data.storedWhere, RACE_DAY_LIMITS.videoStoredWhere);
  const note = boundedNullableString(data.note, RACE_DAY_LIMITS.videoNote);
  if (
    data.videoId !== id ||
    typeof raceId !== "string" ||
    typeof rosterId !== "string" ||
    typeof label !== "string" ||
    label.length < 1 ||
    label.length > RACE_DAY_LIMITS.videoLabel ||
    externalUrl === undefined ||
    storedWhere === undefined ||
    note === undefined
  ) {
    return fail("video fields have the wrong shape");
  }
  // A link is only ever followed by the user; one that is not a plain http(s) link is hidden
  // rather than rendered as something clickable.
  if (externalUrl !== null && checkExternalUrl(externalUrl) !== "ok") {
    return fail("externalUrl is not a plain http(s) link");
  }
  return {
    ok: true,
    value: { ...audit.value, videoId: id, raceId, rosterId, label, externalUrl, storedWhere, note },
  };
}

/**
 * `summaries/main`: the user-written part of the summary card. The numbers on the card are
 * never stored; they are computed from the current races and results every time.
 */
export function parseRaceSummary(data: unknown): ParseResult<RaceSummaryDoc> {
  if (!isRecord(data)) {
    return fail("document is not an object");
  }
  const audit = readAudit(data);
  if (!audit.ok) {
    return audit;
  }
  const { summaryVersion } = data;
  const coachNote = boundedNullableString(data.coachNote, RACE_DAY_LIMITS.summaryCoachNote);
  const generatedAt = data.generatedAt === null ? null : readInstant(data.generatedAt);
  if (
    typeof summaryVersion !== "string" ||
    summaryVersion.length > RACE_DAY_LIMITS.summaryVersion ||
    coachNote === undefined ||
    (data.generatedAt !== null && generatedAt === null)
  ) {
    return fail("summary fields have the wrong shape");
  }
  return { ok: true, value: { ...audit.value, summaryVersion, generatedAt, coachNote } };
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

/**
 * Only the start time, for recalculating it when the event's zone changes. It deliberately does
 * not go through `encodeRaceUpdate`: that resets verification to pending, and a recalculated
 * time is not an edit of what the user confirmed. The caller adds `updatedAt`.
 */
export function encodeRaceScheduledAt(iso: string): DocumentData {
  return { scheduledAt: toInstant(iso) };
}

function resultFields(input: RaceResultWriteInput): DocumentData {
  return {
    status: input.status,
    timeSeconds: input.timeSeconds,
    place: input.place,
    advanced: input.advanced,
  };
}

export function encodeRaceResultCreate(
  resultId: string,
  raceId: string,
  rosterId: string,
  input: RaceResultWriteInput,
): DocumentData {
  return {
    resultId,
    raceId,
    rosterId,
    ...resultFields(input),
    ...pendingFields(input.sourceNote),
    ...createdAndUpdated(),
  };
}

/** `raceId` and `rosterId` are part of the id, so an update never changes them. */
export function encodeRaceResultUpdate(input: RaceResultWriteInput): DocumentData {
  return { ...resultFields(input), ...editedFields(input.sourceNote) };
}

function videoFields(input: RaceVideoInput): DocumentData {
  return {
    label: input.label,
    externalUrl: input.externalUrl,
    storedWhere: input.storedWhere,
    note: input.note,
  };
}

export function encodeRaceVideoCreate(
  videoId: string,
  raceId: string,
  rosterId: string,
  input: RaceVideoInput,
): DocumentData {
  return { videoId, raceId, rosterId, ...videoFields(input), ...createdAndUpdated() };
}

/** No provenance to reset: a video record has none. Race and athlete are not changed by an edit. */
export function encodeRaceVideoUpdate(input: RaceVideoInput): DocumentData {
  return { ...videoFields(input), updatedAt: serverTimestamp() };
}

/**
 * `generatedAt` is the time the note was saved (server time). `summaryVersion` records which
 * version of the summary rules the card was showing, so an old note stays explainable.
 */
function summaryFields(input: RaceSummaryNoteInput): DocumentData {
  return {
    summaryVersion: RACE_SUMMARY_VERSION,
    generatedAt: serverTimestamp(),
    coachNote: input.coachNote,
  };
}

export function encodeRaceSummaryCreate(input: RaceSummaryNoteInput): DocumentData {
  return { ...summaryFields(input), ...createdAndUpdated() };
}

export function encodeRaceSummaryUpdate(input: RaceSummaryNoteInput): DocumentData {
  return { ...summaryFields(input), updatedAt: serverTimestamp() };
}
