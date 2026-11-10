import { isRealDateString } from "@skatingx/skating-domain";
import { addDoc, deleteDoc, doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";

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
  /** Present only when the stored value is true. False and a missing field are the same: not completed. */
  isCompleted?: boolean;
  lindsayReflection?: JournalReflection;
};

export type JournalReflection = {
  bestThing?: string;
  needsWork?: string;
  tomorrowFocus?: string;
};

/** Preset focus tags. Anything else is dropped, not rejected. Stored values stay these spellings. */
export const SESSION_FOCUS_TAGS = [
  "start",
  "500m",
  "1000m",
  "1500m",
  "corner_entry",
  "corner_drift",
  "follow_skating",
  "footwork",
  "edges",
  "jumps",
  "spins",
  "program",
  "speed_work",
  "endurance",
] as const;

export type JournalSessionFocusTag = (typeof SESSION_FOCUS_TAGS)[number];

export const SESSION_TYPES = ["ice", "dryland", "private_lesson", "competition", "recovery", "rest"] as const;

export type JournalSessionType = (typeof SESSION_TYPES)[number];

/**
 * One training session under `journal/main/sessions`, not a training-plan session.
 * Several sessions may share a date. Optional numbers are present only when they parsed
 * as a real measurement. Boolean flags are present only when stored as true.
 */
export type JournalSessionRecord = {
  id: string;
  date: string;
  sessionType?: JournalSessionType;
  sessionLabel?: string;
  location?: string;
  durationMinutes?: number;
  iceTimeMinutes?: number;
  drylandMinutes?: number;
  intensity?: number;
  technicalFocus?: string;
  mainSet?: string;
  startsPractice?: true;
  cornerFocus?: true;
  straightawayFocus?: true;
  relayPractice?: true;
  raceSimulation?: true;
  lapTimesNote?: string;
  equipmentNote?: string;
  recoveryNote?: string;
  focusTags?: string[];
  coachName?: string;
  notes?: string;
};

export type JournalSessionInput = {
  date: string;
  sessionType?: string;
  sessionLabel?: string;
  location?: string;
  durationMinutes?: number | string;
  iceTimeMinutes?: number | string;
  drylandMinutes?: number | string;
  intensity?: number | string;
  technicalFocus?: string;
  mainSet?: string;
  startsPractice?: boolean;
  cornerFocus?: boolean;
  straightawayFocus?: boolean;
  relayPractice?: boolean;
  raceSimulation?: boolean;
  lapTimesNote?: string;
  equipmentNote?: string;
  recoveryNote?: string;
  focusTags?: readonly string[];
  coachName?: string;
  notes?: string;
};

export type JournalSessionWrite = {
  date: string;
  sessionType: JournalSessionType;
  updatedAt: string;
  sessionLabel?: string;
  location?: string;
  durationMinutes?: number;
  iceTimeMinutes?: number;
  drylandMinutes?: number;
  intensity?: number;
  technicalFocus?: string;
  mainSet?: string;
  startsPractice?: true;
  cornerFocus?: true;
  straightawayFocus?: true;
  relayPractice?: true;
  raceSimulation?: true;
  lapTimesNote?: string;
  equipmentNote?: string;
  recoveryNote?: string;
  focusTags?: string[];
  coachName?: string;
  notes?: string;
  createdAt?: string;
};

export type JournalSessionWriteFailure = "date";

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
  soreness?: string;
  coachFeedback?: string;
  lindsayReflection?: JournalReflection;
};

export type JournalDayWrite = {
  date: string;
  overallFeeling: number;
  updatedAt: string;
  energy?: number;
  trainingFocus?: string;
  parentNote?: string;
  soreness?: string;
  coachFeedback?: string;
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
  if (fields.isCompleted === true) record.isCompleted = true;
  return record;
}

const SESSION_FLAGS = [
  "startsPractice",
  "cornerFocus",
  "straightawayFocus",
  "relayPractice",
  "raceSimulation",
] as const;

const FOCUS_TAG_SET = new Set<string>(SESSION_FOCUS_TAGS);

/** Empty, blank, and non-numeric input stay unset. `Number("")` is 0, and 0 is never stored. */
function numericValue(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return Number(trimmed);
}

/** A real measurement. Zero, negatives, and anything that is not finite stay off the document. */
function presentMeasure(value: unknown): number | undefined {
  const number = numericValue(value);
  if (number === undefined || !Number.isFinite(number) || number <= 0) return undefined;
  return number;
}

/** An integer inside the inclusive range. Anything else is dropped, not reported. */
function presentInteger(value: unknown, min: number, max: number): number | undefined {
  const number = numericValue(value);
  if (number === undefined || !Number.isInteger(number) || number < min || number > max) return undefined;
  return number;
}

/** Missing or unknown types become ice on a write. A read leaves a missing type missing. */
function sessionTypeOf(value: unknown): JournalSessionType {
  return SESSION_TYPES.includes(value as JournalSessionType) ? (value as JournalSessionType) : "ice";
}

function presentFocusTags(value: readonly string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const selected = new Set(value);
  const kept = SESSION_FOCUS_TAGS.filter((tag) => selected.has(tag));
  return kept.length > 0 ? [...kept] : undefined;
}

function focusTagsFromDocument(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kept = value.filter((tag): tag is string => typeof tag === "string" && FOCUS_TAG_SET.has(tag));
  return kept.length > 0 ? kept : undefined;
}

type SessionText = {
  sessionLabel?: string;
  location?: string;
  technicalFocus?: string;
  mainSet?: string;
  lapTimesNote?: string;
  equipmentNote?: string;
  recoveryNote?: string;
  coachName?: string;
  notes?: string;
};

function assignSessionText(record: SessionText, fields: Record<string, unknown> | JournalSessionInput) {
  const sessionLabel = presentText(fields.sessionLabel);
  const location = presentText(fields.location);
  const technicalFocus = presentText(fields.technicalFocus);
  const mainSet = presentText(fields.mainSet);
  const lapTimesNote = presentText(fields.lapTimesNote);
  const equipmentNote = presentText(fields.equipmentNote);
  const recoveryNote = presentText(fields.recoveryNote);
  const coachName = presentText(fields.coachName);
  const notes = presentText(fields.notes);
  if (sessionLabel !== undefined) record.sessionLabel = sessionLabel;
  if (location !== undefined) record.location = location;
  if (technicalFocus !== undefined) record.technicalFocus = technicalFocus;
  if (mainSet !== undefined) record.mainSet = mainSet;
  if (lapTimesNote !== undefined) record.lapTimesNote = lapTimesNote;
  if (equipmentNote !== undefined) record.equipmentNote = equipmentNote;
  if (recoveryNote !== undefined) record.recoveryNote = recoveryNote;
  if (coachName !== undefined) record.coachName = coachName;
  if (notes !== undefined) record.notes = notes;
}

/** A session document, or null when it has no real `date`. A missing label is kept missing. */
export function journalSessionFromDocument(id: string, data: unknown): JournalSessionRecord | null {
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  if (typeof fields.date !== "string" || !isRealDateString(fields.date)) return null;
  const record: JournalSessionRecord = { id, date: fields.date };
  if (typeof fields.sessionType === "string" && fields.sessionType.trim().length > 0) {
    record.sessionType = sessionTypeOf(fields.sessionType);
  }
  const durationMinutes = presentMeasure(fields.durationMinutes);
  const iceTimeMinutes = presentMeasure(fields.iceTimeMinutes);
  const drylandMinutes = presentMeasure(fields.drylandMinutes);
  const intensity = presentInteger(fields.intensity, 1, 5);
  const focusTags = focusTagsFromDocument(fields.focusTags);
  if (durationMinutes !== undefined) record.durationMinutes = durationMinutes;
  if (iceTimeMinutes !== undefined) record.iceTimeMinutes = iceTimeMinutes;
  if (drylandMinutes !== undefined) record.drylandMinutes = drylandMinutes;
  if (intensity !== undefined) record.intensity = intensity;
  if (focusTags !== undefined) record.focusTags = focusTags;
  for (const flag of SESSION_FLAGS) {
    if (fields[flag] === true) record[flag] = true;
  }
  assignSessionText(record, fields);
  return record;
}

function journalSessionRef(db: Firestore, userId: string, sessionId: string) {
  return doc(journalSessionsCollectionRef(db, userId), sessionId);
}

/**
 * A real date is the only hard check. An unknown session type becomes `ice`. Intensity outside
 * 1–5 is dropped, not defaulted. Blank text, zero, and illegal numbers stay off the document.
 * Flags are written only when true. A new session also gets `createdAt`; an edit only moves `updatedAt`.
 */
export function buildJournalSessionWrite(
  input: JournalSessionInput,
  options: { now: string; creating: boolean },
): { ok: true; data: JournalSessionWrite } | { ok: false; field: JournalSessionWriteFailure } {
  const date = input.date.trim();
  if (!isRealDateString(date)) return { ok: false, field: "date" };
  const data: JournalSessionWrite = {
    date,
    sessionType: sessionTypeOf(input.sessionType),
    updatedAt: options.now,
  };
  const durationMinutes = presentMeasure(input.durationMinutes);
  const iceTimeMinutes = presentMeasure(input.iceTimeMinutes);
  const drylandMinutes = presentMeasure(input.drylandMinutes);
  const intensity = presentInteger(input.intensity, 1, 5);
  const focusTags = presentFocusTags(input.focusTags);
  if (durationMinutes !== undefined) data.durationMinutes = durationMinutes;
  if (iceTimeMinutes !== undefined) data.iceTimeMinutes = iceTimeMinutes;
  if (drylandMinutes !== undefined) data.drylandMinutes = drylandMinutes;
  if (intensity !== undefined) data.intensity = intensity;
  if (focusTags !== undefined) data.focusTags = focusTags;
  for (const flag of SESSION_FLAGS) {
    if (input[flag] === true) data[flag] = true;
  }
  assignSessionText(data, input);
  if (options.creating) data.createdAt = options.now;
  return { ok: true, data };
}

/** `addDoc` assigns the id. A date that is not a real day is refused and nothing is written. */
export async function createJournalSession(
  db: Firestore,
  userId: string,
  input: JournalSessionInput,
  now: string,
): Promise<{ ok: true; id: string } | { ok: false; field: JournalSessionWriteFailure }> {
  const built = buildJournalSessionWrite(input, { now, creating: true });
  if (!built.ok) return built;
  const ref = await addDoc(journalSessionsCollectionRef(db, userId), toFirestoreData(built.data));
  return { ok: true, id: ref.id };
}

/** Merge the edited fields and `updatedAt`. `createdAt` is not sent, so the original time stays. */
export async function updateJournalSession(
  db: Firestore,
  userId: string,
  sessionId: string,
  input: JournalSessionInput,
  now: string,
): Promise<{ ok: true } | { ok: false; field: JournalSessionWriteFailure }> {
  const built = buildJournalSessionWrite(input, { now, creating: false });
  if (!built.ok) return built;
  await setDoc(journalSessionRef(db, userId, sessionId), toFirestoreData(built.data), { merge: true });
  return { ok: true };
}

/** Ownership is the rules' job. This does not read the session first, and it does not touch the diary. */
export async function deleteJournalSession(db: Firestore, userId: string, sessionId: string): Promise<void> {
  await deleteDoc(journalSessionRef(db, userId, sessionId));
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
  const soreness = presentText(input.soreness);
  const coachFeedback = presentText(input.coachFeedback);
  const lindsayReflection = presentReflection(input.lindsayReflection);
  if (trainingFocus !== undefined) data.trainingFocus = trainingFocus;
  if (parentNote !== undefined) data.parentNote = parentNote;
  if (soreness !== undefined) data.soreness = soreness;
  if (coachFeedback !== undefined) data.coachFeedback = coachFeedback;
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

/**
 * Merge only the completion flag and `updatedAt`. Other fields, including `createdAt`, stay as stored.
 * `now` is the same clock the page passes to `buildJournalDayWrite`.
 */
export async function setJournalDayCompleted(
  db: Firestore,
  userId: string,
  documentId: string,
  completed: boolean,
  now: string,
): Promise<void> {
  await setDoc(
    journalDayRef(db, userId, documentId),
    toFirestoreData({ isCompleted: completed, updatedAt: now }),
    { merge: true },
  );
}
