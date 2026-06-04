import {
  DEFAULT_TRAINING_DISTANCES,
  type DistanceRecordsDocument,
  type TimeEntry,
  type TimeEntrySource,
} from "@skatingx/schema";
import {
  createTimeEntryId,
  normalizeDistanceRecordsDocument,
  normalizeTimeEntry,
} from "@skatingx/skating-domain";
import {
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

import { trainingRecordRef } from "./refs";
import {
  serializeTimeEntries,
  serializeTimeEntry,
  toFirestoreData,
} from "./sanitize";

export type RecordsActorContext = {
  db: Firestore;
  userId: string;
  athleteId: string;
};

function emptyDistanceDoc(
  distanceId: string,
  label: string,
): Omit<DistanceRecordsDocument, "updatedAt"> {
  return {
    distanceId,
    label,
    unit: "seconds",
    entries: [],
  };
}

export async function ensureDefaultDistanceRecords(
  ctx: RecordsActorContext,
): Promise<string[]> {
  const created: string[] = [];

  for (const distance of DEFAULT_TRAINING_DISTANCES) {
    const ref = trainingRecordRef(
      ctx.db,
      ctx.userId,
      ctx.athleteId,
      distance.distanceId,
    );
    const snap = await getDoc(ref);
    if (snap.exists()) {
      continue;
    }
    await setDoc(
      ref,
      toFirestoreData({
        ...emptyDistanceDoc(distance.distanceId, distance.label),
        updatedAt: serverTimestamp(),
      }),
    );
    created.push(distance.distanceId);
  }

  return created;
}

export function readDistanceRecordsDocument(
  distanceId: string,
  label: string,
  raw: DistanceRecordsDocument | undefined,
): DistanceRecordsDocument {
  const normalized = normalizeDistanceRecordsDocument(distanceId, label, raw);
  return {
    ...normalized,
    updatedAt: raw?.updatedAt,
  };
}

export async function addTimeEntry(
  ctx: RecordsActorContext,
  distanceId: string,
  label: string,
  input: {
    date: string;
    timeSeconds: number;
    source?: TimeEntrySource;
    note?: string;
  },
): Promise<TimeEntry> {
  const ref = trainingRecordRef(ctx.db, ctx.userId, ctx.athleteId, distanceId);
  const snap = await getDoc(ref);
  const existing = readDistanceRecordsDocument(
    distanceId,
    label,
    snap.data() as DistanceRecordsDocument | undefined,
  );
  const ids = new Set(existing.entries.map((e) => e.id));
  const nowIso = new Date().toISOString();
  const entry = serializeTimeEntry(
    normalizeTimeEntry({
      id: createTimeEntryId(ids),
      date: input.date,
      timeSeconds: input.timeSeconds,
      source: input.source ?? "manual",
      note: input.note,
      createdAt: nowIso,
      updatedAt: nowIso,
    }),
  );

  const entries = serializeTimeEntries([...existing.entries, entry]);

  if (snap.exists()) {
    await updateDoc(
      ref,
      toFirestoreData({
        entries,
        updatedAt: serverTimestamp(),
      }),
    );
  } else {
    await setDoc(
      ref,
      toFirestoreData({
        ...emptyDistanceDoc(distanceId, label),
        entries,
        updatedAt: serverTimestamp(),
      }),
    );
  }

  return entry;
}

export async function updateTimeEntry(
  ctx: RecordsActorContext,
  distanceId: string,
  label: string,
  entryId: string,
  patch: {
    date: string;
    timeSeconds: number;
    source?: TimeEntrySource;
    note?: string;
  },
): Promise<void> {
  const ref = trainingRecordRef(ctx.db, ctx.userId, ctx.athleteId, distanceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Distance record document not found.");
  }

  const existing = readDistanceRecordsDocument(
    distanceId,
    label,
    snap.data() as DistanceRecordsDocument | undefined,
  );
  const nowIso = new Date().toISOString();
  const entries = serializeTimeEntries(
    existing.entries.map((entry) => {
      if (entry.id !== entryId) {
        return entry;
      }
      return serializeTimeEntry(
        normalizeTimeEntry({
          ...entry,
          date: patch.date,
          timeSeconds: patch.timeSeconds,
          source: patch.source ?? entry.source,
          note: patch.note,
          updatedAt: nowIso,
        }),
      );
    }),
  );

  await updateDoc(
    ref,
    toFirestoreData({
      entries,
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function deleteTimeEntry(
  ctx: RecordsActorContext,
  distanceId: string,
  label: string,
  entryId: string,
): Promise<void> {
  const ref = trainingRecordRef(ctx.db, ctx.userId, ctx.athleteId, distanceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return;
  }

  const existing = readDistanceRecordsDocument(
    distanceId,
    label,
    snap.data() as DistanceRecordsDocument | undefined,
  );
  const entries = serializeTimeEntries(
    existing.entries.filter((entry) => entry.id !== entryId),
  );

  await updateDoc(
    ref,
    toFirestoreData({
      entries,
      updatedAt: serverTimestamp(),
    }),
  );
}
