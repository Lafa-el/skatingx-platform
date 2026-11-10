import { isRealDateString } from "@skatingx/skating-domain";
import { addDoc, deleteDoc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";

import { journalBodyStatusCollectionRef, journalBodyStatusRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/** The only soreness areas a body-status record keeps. Anything else is dropped, not rejected. */
export const BODY_SORENESS_AREAS = [
  "quadriceps",
  "hamstrings",
  "calves",
  "lower_back",
  "shoulders",
  "knees",
  "ankles",
  "hips",
  "glutes",
  "core",
] as const;

export type BodyStatusSorenessArea = (typeof BODY_SORENESS_AREAS)[number];

/**
 * One body-status row under `journal/main/bodyStatus`. Several rows may share a date.
 * Optional numbers are present only when they parsed as a real measurement.
 */
export type BodyStatusRecord = {
  id: string;
  date: string;
  sleepHours?: number;
  fatigueLevel?: number;
  mood?: number;
  sorenessAreas?: string[];
  bodyWeightLb?: number;
  heightCm?: number;
  injuryNote?: string;
};

export type BodyStatusInput = {
  date: string;
  sleepHours?: number | string;
  fatigueLevel?: number | string;
  mood?: number | string;
  sorenessAreas?: readonly string[];
  bodyWeightLb?: number | string;
  heightCm?: number | string;
  injuryNote?: string;
};

export type BodyStatusWrite = {
  date: string;
  updatedAt: string;
  sleepHours?: number;
  fatigueLevel?: number;
  mood?: number;
  sorenessAreas?: string[];
  bodyWeightLb?: number;
  heightCm?: number;
  injuryNote?: string;
  createdAt?: string;
};

export type BodyStatusWriteFailure = "date";

export type BodyStatusSnapshot = {
  entries: readonly BodyStatusRecord[];
  dropped: number;
};

const AREA_SET = new Set<string>(BODY_SORENESS_AREAS);

function presentText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

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

/** Preset order, unknown values dropped. An empty selection stays off the document. */
function presentAreas(value: readonly string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const selected = new Set(value);
  const kept = BODY_SORENESS_AREAS.filter((area) => selected.has(area));
  return kept.length > 0 ? [...kept] : undefined;
}

function areasFromDocument(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kept = value.filter((area): area is string => typeof area === "string" && AREA_SET.has(area));
  return kept.length > 0 ? kept : undefined;
}

/** A status document, or null when its `date` is not a real day. It is counted as dropped, not shown blank. */
export function bodyStatusFromDocument(id: string, data: unknown): BodyStatusRecord | null {
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  if (typeof fields.date !== "string" || !isRealDateString(fields.date)) return null;
  const record: BodyStatusRecord = { id, date: fields.date };
  const sleepHours = presentMeasure(fields.sleepHours);
  const fatigueLevel = presentInteger(fields.fatigueLevel, 1, 5);
  const mood = presentInteger(fields.mood, 1, 6);
  const sorenessAreas = areasFromDocument(fields.sorenessAreas);
  const bodyWeightLb = presentMeasure(fields.bodyWeightLb);
  const heightCm = presentMeasure(fields.heightCm);
  const injuryNote = presentText(fields.injuryNote);
  if (sleepHours !== undefined) record.sleepHours = sleepHours;
  if (fatigueLevel !== undefined) record.fatigueLevel = fatigueLevel;
  if (mood !== undefined) record.mood = mood;
  if (sorenessAreas !== undefined) record.sorenessAreas = sorenessAreas;
  if (bodyWeightLb !== undefined) record.bodyWeightLb = bodyWeightLb;
  if (heightCm !== undefined) record.heightCm = heightCm;
  if (injuryNote !== undefined) record.injuryNote = injuryNote;
  return record;
}

/**
 * A real date is the only hard check. Blank and illegal numbers stay off the document, including
 * the 0 an empty field used to become. Out-of-range fatigue and mood are dropped, not rejected.
 * A new row also gets `createdAt`; an edit only moves `updatedAt`.
 */
export function buildBodyStatusWrite(
  input: BodyStatusInput,
  options: { now: string; creating: boolean },
): { ok: true; data: BodyStatusWrite } | { ok: false; field: BodyStatusWriteFailure } {
  const date = input.date.trim();
  if (!isRealDateString(date)) return { ok: false, field: "date" };
  const data: BodyStatusWrite = { date, updatedAt: options.now };
  const sleepHours = presentMeasure(input.sleepHours);
  const fatigueLevel = presentInteger(input.fatigueLevel, 1, 5);
  const mood = presentInteger(input.mood, 1, 6);
  const sorenessAreas = presentAreas(input.sorenessAreas);
  const bodyWeightLb = presentMeasure(input.bodyWeightLb);
  const heightCm = presentMeasure(input.heightCm);
  const injuryNote = presentText(input.injuryNote);
  if (sleepHours !== undefined) data.sleepHours = sleepHours;
  if (fatigueLevel !== undefined) data.fatigueLevel = fatigueLevel;
  if (mood !== undefined) data.mood = mood;
  if (sorenessAreas !== undefined) data.sorenessAreas = sorenessAreas;
  if (bodyWeightLb !== undefined) data.bodyWeightLb = bodyWeightLb;
  if (heightCm !== undefined) data.heightCm = heightCm;
  if (injuryNote !== undefined) data.injuryNote = injuryNote;
  if (options.creating) data.createdAt = options.now;
  return { ok: true, data };
}

/**
 * The body-status collection for this user. Nothing is written here. The caller unsubscribes
 * on unmount. A document with no real date is counted in `dropped`, not replaced with a blank row.
 * The page sorts by date and shows the latest seven.
 */
export function subscribeToBodyStatus(
  db: Firestore,
  userId: string,
  onData: (snapshot: BodyStatusSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    journalBodyStatusCollectionRef(db, userId),
    (snapshot) => {
      const entries = snapshot.docs.flatMap((entry) => {
        const status = bodyStatusFromDocument(entry.id, entry.data());
        return status ? [status] : [];
      });
      onData({ entries, dropped: snapshot.docs.length - entries.length });
    },
    onError,
  );
}

/** `addDoc` assigns the id. A date that is not a real day is refused and nothing is written. */
export async function createBodyStatus(
  db: Firestore,
  userId: string,
  input: BodyStatusInput,
  now: string,
): Promise<{ ok: true; id: string } | { ok: false; field: BodyStatusWriteFailure }> {
  const built = buildBodyStatusWrite(input, { now, creating: true });
  if (!built.ok) return built;
  const ref = await addDoc(journalBodyStatusCollectionRef(db, userId), toFirestoreData(built.data));
  return { ok: true, id: ref.id };
}

/** Merge the edited fields and `updatedAt`. `createdAt` is not sent, so the original time stays. */
export async function updateBodyStatus(
  db: Firestore,
  userId: string,
  statusId: string,
  input: BodyStatusInput,
  now: string,
): Promise<{ ok: true } | { ok: false; field: BodyStatusWriteFailure }> {
  const built = buildBodyStatusWrite(input, { now, creating: false });
  if (!built.ok) return built;
  await setDoc(journalBodyStatusRef(db, userId, statusId), toFirestoreData(built.data), { merge: true });
  return { ok: true };
}

/** Ownership is the rules' job. This does not read the row first. */
export async function deleteBodyStatus(db: Firestore, userId: string, statusId: string): Promise<void> {
  await deleteDoc(journalBodyStatusRef(db, userId, statusId));
}
