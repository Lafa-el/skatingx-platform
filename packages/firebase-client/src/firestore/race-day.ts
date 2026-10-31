import type {
  RaceEntry,
  RaceEvent,
  RaceResult,
  RaceRosterEntry,
  RaceSummaryDoc,
  RaceVideoRef,
} from "@skatingx/schema";
import {
  createIdSuffix,
  createRaceDayEntityId,
  createRaceResultId,
  isValidRaceDayId,
  prepareRaceEventInput,
  prepareRaceInput,
  prepareRaceResultInput,
  prepareRaceSummaryNoteInput,
  prepareRaceVideoInput,
  prepareRosterEntryInput,
  rezoneRaceSchedules,
  type PreparedInput,
  type RaceDayInputError,
  type RaceEventInput,
  type RaceInput,
  type RaceResultFormInput,
  type RaceVideoInput,
  type RosterEntryInput,
} from "@skatingx/skating-domain";
import {
  arrayRemove,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type FirestoreError,
  type Unsubscribe,
  type WriteBatch,
} from "firebase/firestore";

import {
  encodeRaceCreate,
  encodeRaceEventCreate,
  encodeRaceEventUpdate,
  encodeRaceScheduledAt,
  encodeRaceResultCreate,
  encodeRaceResultUpdate,
  encodeRaceSummaryCreate,
  encodeRaceSummaryUpdate,
  encodeRaceVideoCreate,
  encodeRaceVideoUpdate,
  encodeRaceUpdate,
  encodeRosterEntryCreate,
  encodeRosterEntryUpdate,
  encodeVerification,
  parseRaceEntry,
  parseRaceEvent,
  parseRaceResult,
  parseRaceSummary,
  parseRaceVideo,
  parseRosterEntry,
  type ParseResult,
} from "./race-day-codec";
import {
  raceDayEventRef,
  raceDayEventsCollectionRef,
  raceDayRaceRef,
  raceDayRacesCollectionRef,
  raceDayResultRef,
  raceDayResultsCollectionRef,
  raceDayRosterCollectionRef,
  raceDayRosterRef,
  raceDaySummaryRef,
  raceDayVideoRef,
  raceDayVideosCollectionRef,
} from "./refs";

/**
 * Race Day repository (ADR-001 D3, D6). The only place that reads or writes Race Day
 * documents: UI code calls these functions and never touches Firestore directly.
 *
 * Failure model:
 * - Invalid input throws `RaceDayValidationError` *before* anything is written, so forms can
 *   show field errors.
 * - Firestore failures (permission denied, network, ...) propagate as `FirestoreError`; its
 *   `code` lets the UI pick a message. Nothing is swallowed here.
 * - Security Rules remain the enforced boundary; the checks here only give earlier, clearer
 *   feedback.
 */

export type RaceDayContext = { db: Firestore; userId: string };

export class RaceDayValidationError extends Error {
  readonly errors: RaceDayInputError[];

  constructor(errors: RaceDayInputError[]) {
    super(
      `Invalid Race Day input: ${errors.map((e) => `${e.field}:${e.code}`).join(", ")}`,
    );
    this.name = "RaceDayValidationError";
    this.errors = errors;
  }
}

/** A document that exists but failed validation. Reported, not displayed and not guessed at. */
export type InvalidRaceDayDocument = { id: string; reason: string };

export type RaceDayList<T> = {
  items: T[];
  invalid: InvalidRaceDayDocument[];
  /**
   * True while the snapshot comes from the local cache only. A cached list can be missing
   * documents that exist on the server, so it must never be read as "these were deleted".
   */
  fromCache?: boolean;
};

export type RaceDaySubscribeOptions = {
  /**
   * Also fire when only the metadata changes (cache -> server). Off for screens, which only care
   * about data; the records sync needs it to know when a list became authoritative.
   */
  includeMetadataChanges?: boolean;
};

export type RaceDayListError = { code: string; message: string };

function validated<T>(prepared: PreparedInput<T>): T {
  if (prepared.errors.length > 0) {
    throw new RaceDayValidationError(prepared.errors);
  }
  return prepared.value;
}

function resolveId(explicit: string | undefined, label: string): string {
  if (explicit === undefined) {
    return createRaceDayEntityId(label, createIdSuffix());
  }
  if (!isValidRaceDayId(explicit)) {
    throw new RaceDayValidationError([{ field: "id", code: "invalidFormat" }]);
  }
  return explicit;
}

function assertValidId(field: string, id: string): void {
  if (!isValidRaceDayId(id)) {
    throw new RaceDayValidationError([{ field, code: "invalidFormat" }]);
  }
}

// --- subscriptions ----------------------------------------------------------------

function subscribeToList<T>(
  ref: CollectionReference,
  parse: (id: string, data: unknown) => ParseResult<T>,
  onData: (list: RaceDayList<T>) => void,
  onError: (error: RaceDayListError) => void,
  options: RaceDaySubscribeOptions = {},
): Unsubscribe {
  return onSnapshot(
    ref,
    { includeMetadataChanges: options.includeMetadataChanges === true },
    (snapshot) => {
      const items: T[] = [];
      const invalid: InvalidRaceDayDocument[] = [];
      for (const docSnap of snapshot.docs) {
        // "estimate" shows the local time for a write that has not reached the server yet,
        // so an entry saved offline appears immediately instead of looking half-written.
        const parsed = parse(docSnap.id, docSnap.data({ serverTimestamps: "estimate" }));
        if (parsed.ok) {
          items.push(parsed.value);
        } else {
          invalid.push({ id: docSnap.id, reason: parsed.reason });
        }
      }
      onData({ items, invalid, fromCache: snapshot.metadata.fromCache });
    },
    (error: FirestoreError) => {
      onError({ code: error.code, message: error.message });
    },
  );
}

// --- events -------------------------------------------------------------------------

/** Returns the new event id. Pass `eventId` for a human-chosen slug such as "buffalo-2026". */
export async function createRaceEvent(
  ctx: RaceDayContext,
  input: RaceEventInput,
  options: { eventId?: string } = {},
): Promise<string> {
  const value = validated(prepareRaceEventInput(input));
  const eventId = resolveId(options.eventId, value.name);
  // A second create with an existing id is an update to Firestore, and the rules reject it
  // (createdAt would change), so an event cannot be silently overwritten.
  await setDoc(raceDayEventRef(ctx.db, ctx.userId, eventId), encodeRaceEventCreate(eventId, value));
  return eventId;
}

/**
 * Creates an event and its races in ONE batch: either everything is written or nothing is, so
 * a template can never leave a half-built event behind. Ids are chosen by the caller (templates
 * use fixed ids); applying the same template twice is rejected by the rules (createdAt would
 * change), so it cannot overwrite what the user has edited since.
 */
export async function createRaceEventWithRaces(
  ctx: RaceDayContext,
  eventId: string,
  eventInput: RaceEventInput,
  races: readonly { raceId: string; input: RaceInput }[],
): Promise<string> {
  assertValidId("eventId", eventId);
  const event = validated(prepareRaceEventInput(eventInput));
  const prepared = races.map((race) => {
    assertValidId("raceId", race.raceId);
    return { raceId: race.raceId, value: validated(prepareRaceInput(race.input)) };
  });
  if (new Set(prepared.map((r) => r.raceId)).size !== prepared.length) {
    throw new RaceDayValidationError([{ field: "raceId", code: "duplicate" }]);
  }

  const batch = writeBatch(ctx.db);
  batch.set(raceDayEventRef(ctx.db, ctx.userId, eventId), encodeRaceEventCreate(eventId, event));
  for (const race of prepared) {
    batch.set(
      raceDayRaceRef(ctx.db, ctx.userId, eventId, race.raceId),
      encodeRaceCreate(race.raceId, race.value),
    );
  }
  await batch.commit();
  return eventId;
}

export async function updateRaceEvent(
  ctx: RaceDayContext,
  eventId: string,
  input: RaceEventInput,
): Promise<void> {
  assertValidId("eventId", eventId);
  const value = validated(prepareRaceEventInput(input));
  const eventRef = raceDayEventRef(ctx.db, ctx.userId, eventId);

  // The races hold instants. When the event's zone changes, the wall clock the user typed stays
  // and the instants move with it, so the schedule keeps reading the same on screen. Without a
  // readable old zone (no document, unreadable, or none set) or a new one there is nothing to
  // recover or show, so the event is just updated, as before.
  const previousZone = await readStoredTimeZone(eventRef, eventId);
  if (previousZone !== null && value.timeZone !== null && previousZone !== value.timeZone) {
    const snapshot = await getDocs(raceDayRacesCollectionRef(ctx.db, ctx.userId, eventId));
    const races: RaceEntry[] = [];
    for (const docSnap of snapshot.docs) {
      // A race that does not parse is left untouched rather than guessed at.
      const parsed = parseRaceEntry(docSnap.id, docSnap.data({ serverTimestamps: "estimate" }));
      if (parsed.ok) {
        races.push(parsed.value);
      }
    }
    const changes = rezoneRaceSchedules(races, previousZone, value.timeZone);
    if (changes.length > 0) {
      // One batch in practice (an event has far fewer races than the limit): the zone and the
      // times change together or not at all. Only `scheduledAt` and `updatedAt` are written to a
      // race, never its verification, which `encodeRaceUpdate` would reset.
      await commitInBatches(ctx.db, [
        (batch) => batch.update(eventRef, encodeRaceEventUpdate(value)),
        ...changes.map(
          (change): BatchOperation =>
            (batch) =>
              batch.update(raceDayRaceRef(ctx.db, ctx.userId, eventId, change.raceId), {
                ...encodeRaceScheduledAt(change.scheduledAt),
                updatedAt: serverTimestamp(),
              }),
        ),
      ]);
      return;
    }
  }
  await updateDoc(eventRef, encodeRaceEventUpdate(value));
}

/** The zone saved on the event, or null when the document is missing, unreadable or has none. */
async function readStoredTimeZone(
  eventRef: DocumentReference,
  eventId: string,
): Promise<string | null> {
  const snapshot = await getDoc(eventRef);
  if (!snapshot.exists()) {
    return null;
  }
  const parsed = parseRaceEvent(eventId, snapshot.data({ serverTimestamps: "estimate" }));
  return parsed.ok ? parsed.value.timeZone : null;
}

export async function setRaceEventVerified(
  ctx: RaceDayContext,
  eventId: string,
  verified: boolean,
): Promise<void> {
  assertValidId("eventId", eventId);
  await updateDoc(raceDayEventRef(ctx.db, ctx.userId, eventId), encodeVerification(verified));
}

/**
 * Subcollections that belong to an event. The summary is not here: its rules allow only the
 * document `summaries/main`, so a collection query on it is denied and it is deleted by ref.
 */
const EVENT_SUBCOLLECTIONS = [
  raceDayRosterCollectionRef,
  raceDayRacesCollectionRef,
  raceDayResultsCollectionRef,
  raceDayVideosCollectionRef,
] as const;

/** Firestore allows 500 writes per batch; stay below it. */
const BATCH_LIMIT = 450;

type BatchOperation = (batch: WriteBatch) => void;

/** One batch when it fits, so the whole change is atomic; chunks otherwise, in the given order. */
async function commitInBatches(db: Firestore, operations: readonly BatchOperation[]): Promise<void> {
  for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(start, start + BATCH_LIMIT)) {
      operation(batch);
    }
    await batch.commit();
  }
}

/**
 * Deletes an event and everything under it. Firestore does not cascade, and orphaned roster
 * documents (names of athletes) must not stay behind invisibly. Children go first and the
 * event document last, so a partial failure leaves a visible event that can be deleted again.
 */
export async function deleteRaceEvent(ctx: RaceDayContext, eventId: string): Promise<void> {
  assertValidId("eventId", eventId);

  const refs: DocumentReference[] = [];
  for (const collectionRef of EVENT_SUBCOLLECTIONS) {
    const snapshot = await getDocs(collectionRef(ctx.db, ctx.userId, eventId));
    refs.push(...snapshot.docs.map((d) => d.ref));
  }
  // Deleting a document that does not exist is allowed and does nothing, so no read is needed.
  refs.push(raceDaySummaryRef(ctx.db, ctx.userId, eventId));

  for (let start = 0; start < refs.length; start += BATCH_LIMIT) {
    const batch = writeBatch(ctx.db);
    for (const ref of refs.slice(start, start + BATCH_LIMIT)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
  await deleteDoc(raceDayEventRef(ctx.db, ctx.userId, eventId));
}

export function subscribeToRaceEvents(
  ctx: RaceDayContext,
  onData: (list: RaceDayList<RaceEvent>) => void,
  onError: (error: RaceDayListError) => void,
  options?: RaceDaySubscribeOptions,
): Unsubscribe {
  return subscribeToList(
    raceDayEventsCollectionRef(ctx.db, ctx.userId),
    parseRaceEvent,
    onData,
    onError,
    options,
  );
}

// --- roster -------------------------------------------------------------------------

export async function createRosterEntry(
  ctx: RaceDayContext,
  eventId: string,
  input: RosterEntryInput,
  options: { rosterId?: string } = {},
): Promise<string> {
  assertValidId("eventId", eventId);
  const value = validated(prepareRosterEntryInput(input));
  const rosterId = resolveId(options.rosterId, value.displayName);
  await setDoc(
    raceDayRosterRef(ctx.db, ctx.userId, eventId, rosterId),
    encodeRosterEntryCreate(rosterId, value),
  );
  return rosterId;
}

export async function updateRosterEntry(
  ctx: RaceDayContext,
  eventId: string,
  rosterId: string,
  input: RosterEntryInput,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertValidId("rosterId", rosterId);
  const value = validated(prepareRosterEntryInput(input));
  await updateDoc(
    raceDayRosterRef(ctx.db, ctx.userId, eventId, rosterId),
    encodeRosterEntryUpdate(value),
  );
}

export async function setRosterEntryVerified(
  ctx: RaceDayContext,
  eventId: string,
  rosterId: string,
  verified: boolean,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertValidId("rosterId", rosterId);
  await updateDoc(
    raceDayRosterRef(ctx.db, ctx.userId, eventId, rosterId),
    encodeVerification(verified),
  );
}

/**
 * Deletes an athlete, removes them from every race that listed them, and deletes their results
 * and video records.
 * Everything goes in one atomic batch whenever it fits (it does for any realistic event), so no
 * race or result keeps pointing at a person who no longer exists. Removing the reference does not
 * change a race's verification: the race data itself was not edited. Videos that reference the
 * athlete are handled when that slice ships.
 */
export async function deleteRosterEntry(
  ctx: RaceDayContext,
  eventId: string,
  rosterId: string,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertValidId("rosterId", rosterId);

  const races = await getDocs(
    query(
      raceDayRacesCollectionRef(ctx.db, ctx.userId, eventId),
      where("rosterIds", "array-contains", rosterId),
    ),
  );
  const results = await getDocs(
    query(raceDayResultsCollectionRef(ctx.db, ctx.userId, eventId), where("rosterId", "==", rosterId)),
  );
  const videos = await getDocs(
    query(raceDayVideosCollectionRef(ctx.db, ctx.userId, eventId), where("rosterId", "==", rosterId)),
  );

  const operations: BatchOperation[] = [];
  for (const race of races.docs) {
    const patch: DocumentData = { rosterIds: arrayRemove(rosterId), updatedAt: serverTimestamp() };
    operations.push((batch) => batch.update(race.ref, patch));
  }
  for (const result of results.docs) {
    operations.push((batch) => batch.delete(result.ref));
  }
  // Only the records: the video files themselves are never in this app.
  for (const video of videos.docs) {
    operations.push((batch) => batch.delete(video.ref));
  }
  // Last, so a partial failure leaves a visible athlete that can be deleted again.
  operations.push((batch) => batch.delete(raceDayRosterRef(ctx.db, ctx.userId, eventId, rosterId)));
  await commitInBatches(ctx.db, operations);
}

export function subscribeToRoster(
  ctx: RaceDayContext,
  eventId: string,
  onData: (list: RaceDayList<RaceRosterEntry>) => void,
  onError: (error: RaceDayListError) => void,
  options?: RaceDaySubscribeOptions,
): Unsubscribe {
  assertValidId("eventId", eventId);
  return subscribeToList(
    raceDayRosterCollectionRef(ctx.db, ctx.userId, eventId),
    parseRosterEntry,
    onData,
    onError,
    options,
  );
}

// --- races (schedule) ---------------------------------------------------------------

export async function createRace(
  ctx: RaceDayContext,
  eventId: string,
  input: RaceInput,
  options: { raceId?: string } = {},
): Promise<string> {
  assertValidId("eventId", eventId);
  const value = validated(prepareRaceInput(input));
  const raceId = resolveId(options.raceId, value.label);
  await setDoc(raceDayRaceRef(ctx.db, ctx.userId, eventId, raceId), encodeRaceCreate(raceId, value));
  return raceId;
}

export async function updateRace(
  ctx: RaceDayContext,
  eventId: string,
  raceId: string,
  input: RaceInput,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertValidId("raceId", raceId);
  const value = validated(prepareRaceInput(input));
  await updateDoc(raceDayRaceRef(ctx.db, ctx.userId, eventId, raceId), encodeRaceUpdate(value));
}

export async function setRaceVerified(
  ctx: RaceDayContext,
  eventId: string,
  raceId: string,
  verified: boolean,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertValidId("raceId", raceId);
  await updateDoc(
    raceDayRaceRef(ctx.db, ctx.userId, eventId, raceId),
    encodeVerification(verified),
  );
}

export async function deleteRace(
  ctx: RaceDayContext,
  eventId: string,
  raceId: string,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertValidId("raceId", raceId);

  // Results and video records of a race that no longer exists would be orphans nobody can reach.
  const results = await getDocs(
    query(raceDayResultsCollectionRef(ctx.db, ctx.userId, eventId), where("raceId", "==", raceId)),
  );
  const videos = await getDocs(
    query(raceDayVideosCollectionRef(ctx.db, ctx.userId, eventId), where("raceId", "==", raceId)),
  );
  const operations: BatchOperation[] = [...results.docs, ...videos.docs].map(
    (child) => (batch) => batch.delete(child.ref),
  );
  operations.push((batch) => batch.delete(raceDayRaceRef(ctx.db, ctx.userId, eventId, raceId)));
  await commitInBatches(ctx.db, operations);
}

export function subscribeToRaces(
  ctx: RaceDayContext,
  eventId: string,
  onData: (list: RaceDayList<RaceEntry>) => void,
  onError: (error: RaceDayListError) => void,
  options?: RaceDaySubscribeOptions,
): Unsubscribe {
  assertValidId("eventId", eventId);
  return subscribeToList(
    raceDayRacesCollectionRef(ctx.db, ctx.userId, eventId),
    parseRaceEntry,
    onData,
    onError,
    options,
  );
}

// --- results ------------------------------------------------------------------------

/**
 * One result per race and athlete, with the deterministic id `{raceId}_{rosterId}`.
 * `create` and `update` are separate on purpose: the rules reject a second create (it would
 * rewrite `createdAt`), so the caller picks from the live list instead of overwriting blindly.
 */
export async function createRaceResult(
  ctx: RaceDayContext,
  eventId: string,
  raceId: string,
  rosterId: string,
  input: RaceResultFormInput,
): Promise<string> {
  assertValidId("eventId", eventId);
  assertValidId("raceId", raceId);
  assertValidId("rosterId", rosterId);
  const value = validated(prepareRaceResultInput(input));
  const resultId = createRaceResultId(raceId, rosterId);
  await setDoc(
    raceDayResultRef(ctx.db, ctx.userId, eventId, resultId),
    encodeRaceResultCreate(resultId, raceId, rosterId, value),
  );
  return resultId;
}

export async function updateRaceResult(
  ctx: RaceDayContext,
  eventId: string,
  resultId: string,
  input: RaceResultFormInput,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertResultId(resultId);
  const value = validated(prepareRaceResultInput(input));
  await updateDoc(raceDayResultRef(ctx.db, ctx.userId, eventId, resultId), encodeRaceResultUpdate(value));
}

export async function setRaceResultVerified(
  ctx: RaceDayContext,
  eventId: string,
  resultId: string,
  verified: boolean,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertResultId(resultId);
  await updateDoc(raceDayResultRef(ctx.db, ctx.userId, eventId, resultId), encodeVerification(verified));
}

export async function deleteRaceResult(
  ctx: RaceDayContext,
  eventId: string,
  resultId: string,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertResultId(resultId);
  await deleteDoc(raceDayResultRef(ctx.db, ctx.userId, eventId, resultId));
}

export function subscribeToRaceResults(
  ctx: RaceDayContext,
  eventId: string,
  onData: (list: RaceDayList<RaceResult>) => void,
  onError: (error: RaceDayListError) => void,
  options?: RaceDaySubscribeOptions,
): Unsubscribe {
  assertValidId("eventId", eventId);
  return subscribeToList(
    raceDayResultsCollectionRef(ctx.db, ctx.userId, eventId),
    parseRaceResult,
    onData,
    onError,
    options,
  );
}

/** `{raceId}_{rosterId}`: both halves are slugs, and "_" is not allowed inside a slug. */
function assertResultId(resultId: string): void {
  const parts = resultId.split("_");
  if (parts.length !== 2 || !parts.every((part) => isValidRaceDayId(part))) {
    throw new RaceDayValidationError([{ field: "resultId", code: "invalidFormat" }]);
  }
}

// --- videos (metadata only) ---------------------------------------------------------

/**
 * A video record says which race and athlete a clip belongs to and where it is kept. It never
 * holds the video (ADR-001 D4). Several records per race and athlete are allowed, so the id is
 * generated, unlike results.
 */
export async function createRaceVideo(
  ctx: RaceDayContext,
  eventId: string,
  raceId: string,
  rosterId: string,
  input: RaceVideoInput,
  options: { videoId?: string } = {},
): Promise<string> {
  assertValidId("eventId", eventId);
  assertValidId("raceId", raceId);
  assertValidId("rosterId", rosterId);
  const value = validated(prepareRaceVideoInput(input));
  const videoId = resolveId(options.videoId, value.label);
  await setDoc(
    raceDayVideoRef(ctx.db, ctx.userId, eventId, videoId),
    encodeRaceVideoCreate(videoId, raceId, rosterId, value),
  );
  return videoId;
}

export async function updateRaceVideo(
  ctx: RaceDayContext,
  eventId: string,
  videoId: string,
  input: RaceVideoInput,
): Promise<void> {
  assertValidId("eventId", eventId);
  assertValidId("videoId", videoId);
  const value = validated(prepareRaceVideoInput(input));
  await updateDoc(raceDayVideoRef(ctx.db, ctx.userId, eventId, videoId), encodeRaceVideoUpdate(value));
}

export async function deleteRaceVideo(ctx: RaceDayContext, eventId: string, videoId: string): Promise<void> {
  assertValidId("eventId", eventId);
  assertValidId("videoId", videoId);
  await deleteDoc(raceDayVideoRef(ctx.db, ctx.userId, eventId, videoId));
}

export function subscribeToRaceVideos(
  ctx: RaceDayContext,
  eventId: string,
  onData: (list: RaceDayList<RaceVideoRef>) => void,
  onError: (error: RaceDayListError) => void,
): Unsubscribe {
  assertValidId("eventId", eventId);
  return subscribeToList(
    raceDayVideosCollectionRef(ctx.db, ctx.userId, eventId),
    parseRaceVideo,
    onData,
    onError,
  );
}

// --- summary note ---------------------------------------------------------------------

/** Create and update are separate: the caller knows from the live document which one applies. */
export async function createRaceSummary(
  ctx: RaceDayContext,
  eventId: string,
  input: { coachNote: string },
): Promise<void> {
  assertValidId("eventId", eventId);
  const value = validated(prepareRaceSummaryNoteInput(input.coachNote));
  await setDoc(raceDaySummaryRef(ctx.db, ctx.userId, eventId), encodeRaceSummaryCreate(value));
}

export async function updateRaceSummary(
  ctx: RaceDayContext,
  eventId: string,
  input: { coachNote: string },
): Promise<void> {
  assertValidId("eventId", eventId);
  const value = validated(prepareRaceSummaryNoteInput(input.coachNote));
  await updateDoc(raceDaySummaryRef(ctx.db, ctx.userId, eventId), encodeRaceSummaryUpdate(value));
}

export async function deleteRaceSummary(ctx: RaceDayContext, eventId: string): Promise<void> {
  assertValidId("eventId", eventId);
  await deleteDoc(raceDaySummaryRef(ctx.db, ctx.userId, eventId));
}

/** What the summary document holds right now. */
export type RaceSummaryState =
  | { kind: "none" }
  | { kind: "ready"; summary: RaceSummaryDoc }
  /** The document exists but does not validate: hidden, never guessed at. */
  | { kind: "invalid"; reason: string };

/** Reads the single document by reference: the rules do not allow a collection query. */
export function subscribeToRaceSummary(
  ctx: RaceDayContext,
  eventId: string,
  onData: (state: RaceSummaryState) => void,
  onError: (error: RaceDayListError) => void,
): Unsubscribe {
  assertValidId("eventId", eventId);
  return onSnapshot(
    raceDaySummaryRef(ctx.db, ctx.userId, eventId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData({ kind: "none" });
        return;
      }
      const parsed = parseRaceSummary(snapshot.data({ serverTimestamps: "estimate" }));
      onData(parsed.ok ? { kind: "ready", summary: parsed.value } : { kind: "invalid", reason: parsed.reason });
    },
    (error: FirestoreError) => {
      onError({ code: error.code, message: error.message });
    },
  );
}
