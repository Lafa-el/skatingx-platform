import type { RaceEntry, RaceEvent, RaceRosterEntry } from "@skatingx/schema";
import {
  createIdSuffix,
  createRaceDayEntityId,
  isValidRaceDayId,
  prepareRaceEventInput,
  prepareRaceInput,
  prepareRosterEntryInput,
  type PreparedInput,
  type RaceDayInputError,
  type RaceEventInput,
  type RaceInput,
  type RosterEntryInput,
} from "@skatingx/skating-domain";
import {
  arrayRemove,
  deleteDoc,
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
} from "firebase/firestore";

import {
  encodeRaceCreate,
  encodeRaceEventCreate,
  encodeRaceEventUpdate,
  encodeRaceUpdate,
  encodeRosterEntryCreate,
  encodeRosterEntryUpdate,
  encodeVerification,
  parseRaceEntry,
  parseRaceEvent,
  parseRosterEntry,
  type ParseResult,
} from "./race-day-codec";
import {
  raceDayEventRef,
  raceDayEventsCollectionRef,
  raceDayRaceRef,
  raceDayRacesCollectionRef,
  raceDayRosterCollectionRef,
  raceDayRosterRef,
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

export type RaceDayList<T> = { items: T[]; invalid: InvalidRaceDayDocument[] };

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
): Unsubscribe {
  return onSnapshot(
    ref,
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
      onData({ items, invalid });
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

export async function updateRaceEvent(
  ctx: RaceDayContext,
  eventId: string,
  input: RaceEventInput,
): Promise<void> {
  assertValidId("eventId", eventId);
  const value = validated(prepareRaceEventInput(input));
  await updateDoc(raceDayEventRef(ctx.db, ctx.userId, eventId), encodeRaceEventUpdate(value));
}

export async function setRaceEventVerified(
  ctx: RaceDayContext,
  eventId: string,
  verified: boolean,
): Promise<void> {
  assertValidId("eventId", eventId);
  await updateDoc(raceDayEventRef(ctx.db, ctx.userId, eventId), encodeVerification(verified));
}

/** Subcollections that belong to an event. Extend when results, videos or summaries ship. */
const EVENT_SUBCOLLECTIONS = [raceDayRosterCollectionRef, raceDayRacesCollectionRef] as const;

/** Firestore allows 500 writes per batch; stay below it. */
const BATCH_LIMIT = 450;

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
): Unsubscribe {
  return subscribeToList(raceDayEventsCollectionRef(ctx.db, ctx.userId), parseRaceEvent, onData, onError);
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
 * Deletes an athlete and removes them from every race that listed them, in one atomic batch,
 * so no race keeps pointing at a person who no longer exists. Removing the reference does not
 * change a race's verification: the race data itself was not edited.
 * (Results and videos that reference the athlete are handled when those slices ship.)
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

  const batch = writeBatch(ctx.db);
  for (const race of races.docs) {
    const patch: DocumentData = { rosterIds: arrayRemove(rosterId), updatedAt: serverTimestamp() };
    batch.update(race.ref, patch);
  }
  batch.delete(raceDayRosterRef(ctx.db, ctx.userId, eventId, rosterId));
  await batch.commit();
}

export function subscribeToRoster(
  ctx: RaceDayContext,
  eventId: string,
  onData: (list: RaceDayList<RaceRosterEntry>) => void,
  onError: (error: RaceDayListError) => void,
): Unsubscribe {
  assertValidId("eventId", eventId);
  return subscribeToList(
    raceDayRosterCollectionRef(ctx.db, ctx.userId, eventId),
    parseRosterEntry,
    onData,
    onError,
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
  await deleteDoc(raceDayRaceRef(ctx.db, ctx.userId, eventId, raceId));
}

export function subscribeToRaces(
  ctx: RaceDayContext,
  eventId: string,
  onData: (list: RaceDayList<RaceEntry>) => void,
  onError: (error: RaceDayListError) => void,
): Unsubscribe {
  assertValidId("eventId", eventId);
  return subscribeToList(
    raceDayRacesCollectionRef(ctx.db, ctx.userId, eventId),
    parseRaceEntry,
    onData,
    onError,
  );
}
