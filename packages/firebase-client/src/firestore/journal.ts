import { isRealDateString } from "@skatingx/skating-domain";
import { onSnapshot, setDoc, type Firestore } from "firebase/firestore";

import { journalDayRef, journalDaysCollectionRef, journalSessionsCollectionRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/**
 * One journal day as stored under `journal/main/days`. Migrated documents keep their
 * source id; a day created here uses the date string. `date` is always the field, so
 * both kinds land on the same calendar day. Absent optional fields stay absent.
 */
export type JournalDayRecord = {
  id: string;
  date: string;
  location?: string;
  dayType?: string;
  overallFeeling?: number;
  energy?: number;
  soreness?: string;
  trainingFocus?: string;
  coachFeedback?: string;
  parentNote?: string;
  lindsayReflection?: JournalReflection;
};

export type JournalReflection = {
  bestThing?: string;
  needsWork?: string;
  tomorrowFocus?: string;
};

/** A training session from the journal, not from the training plan. */
export type JournalSessionRecord = {
  id: string;
  date: string;
  sessionLabel?: string;
};

export type JournalSnapshot = {
  days: readonly JournalDayRecord[];
  sessions: readonly JournalSessionRecord[];
  droppedDays: number;
  droppedSessions: number;
};

export type JournalDayInput = {
  date: string;
  overallFeeling: number;
  energy?: number;
  trainingFocus?: string;
  parentNote?: string;
  lindsayReflection?: JournalReflection;
};

export type JournalDayWrite = {
  date: string;
  overallFeeling: number;
  updatedAt: string;
  energy?: number;
  trainingFocus?: string;
  parentNote?: string;
  lindsayReflection?: JournalReflection;
  createdAt?: string;
  isCompleted?: false;
};

export type JournalWriteFailure = "date" | "overallFeeling" | "energy";

const REFLECTION_KEYS = ["bestThing", "needsWork", "tomorrowFocus"] as const;

function presentText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function presentNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function presentReflection(value: unknown): JournalReflection | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const reflection: JournalReflection = {};
  for (const key of REFLECTION_KEYS) {
    const text = presentText(source[key]);
    if (text !== undefined) reflection[key] = text;
  }
  return REFLECTION_KEYS.some((key) => reflection[key] !== undefined) ? reflection : undefined;
}

function isFeeling(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

/** A day document, or null when it has no real `date` and cannot be placed. */
export function journalDayFromDocument(id: string, data: unknown): JournalDayRecord | null {
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  if (typeof fields.date !== "string" || !isRealDateString(fields.date)) return null;
  const record: JournalDayRecord = { id, date: fields.date };
  const location = presentText(fields.location);
  const dayType = presentText(fields.dayType);
  const overallFeeling = presentNumber(fields.overallFeeling);
  const energy = presentNumber(fields.energy);
  const soreness = presentText(fields.soreness);
  const trainingFocus = presentText(fields.trainingFocus);
  const coachFeedback = presentText(fields.coachFeedback);
  const parentNote = presentText(fields.parentNote);
  const lindsayReflection = presentReflection(fields.lindsayReflection);
  if (location !== undefined) record.location = location;
  if (dayType !== undefined) record.dayType = dayType;
  if (overallFeeling !== undefined) record.overallFeeling = overallFeeling;
  if (energy !== undefined) record.energy = energy;
  if (soreness !== undefined) record.soreness = soreness;
  if (trainingFocus !== undefined) record.trainingFocus = trainingFocus;
  if (coachFeedback !== undefined) record.coachFeedback = coachFeedback;
  if (parentNote !== undefined) record.parentNote = parentNote;
  if (lindsayReflection !== undefined) record.lindsayReflection = lindsayReflection;
  return record;
}

/** A session document, or null when it has no real `date`. A missing label is kept missing. */
export function journalSessionFromDocument(id: string, data: unknown): JournalSessionRecord | null {
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  if (typeof fields.date !== "string" || !isRealDateString(fields.date)) return null;
  const record: JournalSessionRecord = { id, date: fields.date };
  const sessionLabel = presentText(fields.sessionLabel);
  if (sessionLabel !== undefined) record.sessionLabel = sessionLabel;
  return record;
}

/**
 * Fields the form actually filled. Empty text stays off the document. `energy` outside 1–5
 * is a failure, not a silent drop. A new day also gets `createdAt` and `isCompleted: false`;
 * an edit only moves `updatedAt`, so a completed day is not reopened and its created time stays.
 */
export function buildJournalDayWrite(
  input: JournalDayInput,
  options: { now: string; creating: boolean },
): { ok: true; data: JournalDayWrite } | { ok: false; field: JournalWriteFailure } {
  if (!isRealDateString(input.date)) return { ok: false, field: "date" };
  if (!isFeeling(input.overallFeeling)) return { ok: false, field: "overallFeeling" };
  if (input.energy !== undefined && !isFeeling(input.energy)) return { ok: false, field: "energy" };

  const data: JournalDayWrite = {
    date: input.date,
    overallFeeling: input.overallFeeling,
    updatedAt: options.now,
  };
  if (input.energy !== undefined) data.energy = input.energy;
  const trainingFocus = presentText(input.trainingFocus);
  const parentNote = presentText(input.parentNote);
  const lindsayReflection = presentReflection(input.lindsayReflection);
  if (trainingFocus !== undefined) data.trainingFocus = trainingFocus;
  if (parentNote !== undefined) data.parentNote = parentNote;
  if (lindsayReflection !== undefined) data.lindsayReflection = lindsayReflection;
  if (options.creating) {
    data.createdAt = options.now;
    data.isCompleted = false;
  }
  return { ok: true, data };
}

/**
 * Both collections, user-level. Nothing is written here. The caller unsubscribes on unmount.
 * A document that cannot be placed is counted in `dropped*`, not replaced with a blank day.
 */
export function subscribeToJournal(
  db: Firestore,
  userId: string,
  onData: (snapshot: JournalSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  let days: readonly JournalDayRecord[] | null = null;
  let sessions: readonly JournalSessionRecord[] | null = null;
  let droppedDays = 0;
  let droppedSessions = 0;

  const emit = () => {
    if (days === null || sessions === null) return;
    onData({ days, sessions, droppedDays, droppedSessions });
  };

  const unsubDays = onSnapshot(
    journalDaysCollectionRef(db, userId),
    (snapshot) => {
      const readable = snapshot.docs.flatMap((entry) => {
        const day = journalDayFromDocument(entry.id, entry.data());
        return day ? [day] : [];
      });
      days = readable;
      droppedDays = snapshot.docs.length - readable.length;
      emit();
    },
    onError,
  );
  const unsubSessions = onSnapshot(
    journalSessionsCollectionRef(db, userId),
    (snapshot) => {
      const readable = snapshot.docs.flatMap((entry) => {
        const session = journalSessionFromDocument(entry.id, entry.data());
        return session ? [session] : [];
      });
      sessions = readable;
      droppedSessions = snapshot.docs.length - readable.length;
      emit();
    },
    onError,
  );

  return () => {
    unsubDays();
    unsubSessions();
  };
}

/**
 * Merge, so a field this form does not edit (location, an old source id's other keys) stays.
 * `documentId` is the existing document when this date already has one — including a migrated
 * source id — and the date string when it does not. One day stays one document.
 */
export async function saveJournalDay(
  db: Firestore,
  userId: string,
  documentId: string,
  data: JournalDayWrite,
): Promise<void> {
  await setDoc(journalDayRef(db, userId, documentId), toFirestoreData(data), { merge: true });
}
