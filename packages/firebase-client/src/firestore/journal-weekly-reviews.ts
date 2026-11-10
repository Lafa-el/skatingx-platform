import { isRealDateString, mondayOfWeek } from "@skatingx/skating-domain";
import { getDoc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";

import { journalWeeklyReviewRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/**
 * One handwritten weekly review. The document id is the Monday (`YYYY-MM-DD`).
 * Stats are not stored here; the page recomputes them for the selected week.
 */
export type WeeklyReviewRecord = {
  id: string;
  weekStart: string;
  bestMoment?: string;
  nextWeekFocus?: string;
  parentSummary?: string;
};

export type WeeklyReviewInput = {
  bestMoment?: string;
  nextWeekFocus?: string;
  parentSummary?: string;
};

export type WeeklyReviewWrite = {
  weekStart: string;
  updatedAt: string;
  bestMoment?: string;
  nextWeekFocus?: string;
  parentSummary?: string;
  createdAt?: string;
};

export type WeeklyReviewWriteFailure = "weekStart";

function presentText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** A real calendar day that is itself the Monday of its week. Anything else is refused. */
function mondayWeekStart(value: string): string | undefined {
  const weekStart = value.trim();
  if (!isRealDateString(weekStart) || mondayOfWeek(weekStart) !== weekStart) return undefined;
  return weekStart;
}

/** The stored review, or null when `weekStart` is not a Monday. A missing sentence stays missing. */
export function weeklyReviewFromDocument(id: string, data: unknown): WeeklyReviewRecord | null {
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  const stored = typeof fields.weekStart === "string" ? fields.weekStart : id;
  const weekStart = mondayWeekStart(stored);
  if (weekStart === undefined) return null;
  const record: WeeklyReviewRecord = { id, weekStart };
  const bestMoment = presentText(fields.bestMoment);
  const nextWeekFocus = presentText(fields.nextWeekFocus);
  const parentSummary = presentText(fields.parentSummary);
  if (bestMoment !== undefined) record.bestMoment = bestMoment;
  if (nextWeekFocus !== undefined) record.nextWeekFocus = nextWeekFocus;
  if (parentSummary !== undefined) record.parentSummary = parentSummary;
  return record;
}

/**
 * A Monday is the only hard check. Blank sentences stay off the document.
 * A new review also gets `createdAt`; a later save of the same week only moves `updatedAt`.
 */
export function buildWeeklyReviewWrite(
  weekStart: string,
  input: WeeklyReviewInput,
  options: { now: string; creating: boolean },
): { ok: true; data: WeeklyReviewWrite } | { ok: false; field: WeeklyReviewWriteFailure } {
  const monday = mondayWeekStart(weekStart);
  if (monday === undefined) return { ok: false, field: "weekStart" };
  const data: WeeklyReviewWrite = { weekStart: monday, updatedAt: options.now };
  const bestMoment = presentText(input.bestMoment);
  const nextWeekFocus = presentText(input.nextWeekFocus);
  const parentSummary = presentText(input.parentSummary);
  if (bestMoment !== undefined) data.bestMoment = bestMoment;
  if (nextWeekFocus !== undefined) data.nextWeekFocus = nextWeekFocus;
  if (parentSummary !== undefined) data.parentSummary = parentSummary;
  if (options.creating) data.createdAt = options.now;
  return { ok: true, data };
}

/**
 * Upsert the Monday document. Saving the same week twice still writes that one id.
 * `createdAt` is sent only when the document is not there yet, so a second save does not move it.
 * Clearing a sentence omits the field; merge leaves the previous sentence in place.
 */
export async function saveWeeklyReview(
  db: Firestore,
  userId: string,
  weekStart: string,
  input: WeeklyReviewInput,
  now: string,
): Promise<{ ok: true } | { ok: false; field: WeeklyReviewWriteFailure }> {
  const monday = mondayWeekStart(weekStart);
  if (monday === undefined) return { ok: false, field: "weekStart" };
  const ref = journalWeeklyReviewRef(db, userId, monday);
  const existing = await getDoc(ref);
  const built = buildWeeklyReviewWrite(monday, input, { now, creating: !existing.exists() });
  if (!built.ok) return built;
  await setDoc(ref, toFirestoreData(built.data), { merge: true });
  return { ok: true };
}

/**
 * The one review for this Monday. A missing document is an empty week (`null`), not a read failure.
 * The caller unsubscribes on unmount and when the selected week changes.
 */
export function subscribeToWeeklyReview(
  db: Firestore,
  userId: string,
  weekStart: string,
  onData: (review: WeeklyReviewRecord | null) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    journalWeeklyReviewRef(db, userId, weekStart),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(weeklyReviewFromDocument(snapshot.id, snapshot.data()));
    },
    onError,
  );
}
