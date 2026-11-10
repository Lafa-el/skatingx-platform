import { isRealDateString } from "@skatingx/skating-domain";
import { addDoc, deleteDoc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";

import { journalCoachNoteRef, journalCoachNotesCollectionRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/** The only technical tags a coach note keeps. Anything else is dropped, not rejected. */
export const COACH_NOTE_TAGS = [
  "corner_entry",
  "corner_drift",
  "high_center_of_gravity",
  "right_leg_support",
  "exit_angle",
  "straightaway_bouncing",
  "incomplete_push",
  "start_technique",
  "block_start",
  "jump_takeoff",
  "rotation",
  "spin_centering",
  "program_flow",
  "transitions",
  "edges",
] as const;

export type CoachNoteTag = (typeof COACH_NOTE_TAGS)[number];

export type CoachNotePriority = "high" | "medium" | "low";

/**
 * One coach note under `journal/main/coachNotes`. `linkedSessionId` is free text from the old
 * site: it is shown as stored and is not a training-session reference.
 */
export type CoachNoteRecord = {
  id: string;
  date: string;
  coachName?: string;
  priority: CoachNotePriority;
  note: string;
  technicalTags?: string[];
  followUpTomorrow?: string;
  linkedSessionId?: string;
};

export type CoachNoteInput = {
  date: string;
  coachName?: string;
  priority?: string;
  note?: string;
  technicalTags?: readonly string[];
  followUpTomorrow?: string;
  linkedSessionId?: string;
};

export type CoachNoteWrite = {
  date: string;
  priority: CoachNotePriority;
  updatedAt: string;
  coachName?: string;
  note?: string;
  technicalTags?: string[];
  followUpTomorrow?: string;
  linkedSessionId?: string;
  createdAt?: string;
};

export type CoachNoteWriteFailure = "date";

export type CoachNoteSnapshot = {
  notes: readonly CoachNoteRecord[];
  dropped: number;
};

const PRIORITIES = ["high", "medium", "low"] as const;
const TAG_SET = new Set<string>(COACH_NOTE_TAGS);

function presentText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function priorityOf(value: unknown): CoachNotePriority {
  return PRIORITIES.includes(value as CoachNotePriority) ? (value as CoachNotePriority) : "medium";
}

/** Preset order, unknown values dropped. An empty selection stays off the document. */
function presentTags(value: readonly string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const selected = new Set(value);
  const kept = COACH_NOTE_TAGS.filter((tag) => selected.has(tag));
  return kept.length > 0 ? [...kept] : undefined;
}

function tagsFromDocument(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kept = value.filter((tag): tag is string => typeof tag === "string" && TAG_SET.has(tag));
  return kept.length > 0 ? kept : undefined;
}

/** A note document, or null when its `date` is not a real day. It is counted as dropped, not shown blank. */
export function coachNoteFromDocument(id: string, data: unknown): CoachNoteRecord | null {
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  if (typeof fields.date !== "string" || !isRealDateString(fields.date)) return null;
  const record: CoachNoteRecord = {
    id,
    date: fields.date,
    priority: priorityOf(fields.priority),
    note: presentText(fields.note) ?? "",
  };
  const coachName = presentText(fields.coachName);
  const technicalTags = tagsFromDocument(fields.technicalTags);
  const followUpTomorrow = presentText(fields.followUpTomorrow);
  const linkedSessionId = presentText(fields.linkedSessionId);
  if (coachName !== undefined) record.coachName = coachName;
  if (technicalTags !== undefined) record.technicalTags = technicalTags;
  if (followUpTomorrow !== undefined) record.followUpTomorrow = followUpTomorrow;
  if (linkedSessionId !== undefined) record.linkedSessionId = linkedSessionId;
  return record;
}

/**
 * A real date is the only hard check. An unknown priority becomes `medium`. Blank text and
 * tags outside the preset stay off the document. A new note also gets `createdAt`; an edit
 * only moves `updatedAt`.
 */
export function buildCoachNoteWrite(
  input: CoachNoteInput,
  options: { now: string; creating: boolean },
): { ok: true; data: CoachNoteWrite } | { ok: false; field: CoachNoteWriteFailure } {
  const date = input.date.trim();
  if (!isRealDateString(date)) return { ok: false, field: "date" };
  const data: CoachNoteWrite = {
    date,
    priority: priorityOf(input.priority),
    updatedAt: options.now,
  };
  const coachName = presentText(input.coachName);
  const note = presentText(input.note);
  const technicalTags = presentTags(input.technicalTags);
  const followUpTomorrow = presentText(input.followUpTomorrow);
  const linkedSessionId = presentText(input.linkedSessionId);
  if (coachName !== undefined) data.coachName = coachName;
  if (note !== undefined) data.note = note;
  if (technicalTags !== undefined) data.technicalTags = technicalTags;
  if (followUpTomorrow !== undefined) data.followUpTomorrow = followUpTomorrow;
  if (linkedSessionId !== undefined) data.linkedSessionId = linkedSessionId;
  if (options.creating) data.createdAt = options.now;
  return { ok: true, data };
}

/**
 * The coach-note collection for this user. Nothing is written here. The caller unsubscribes
 * on unmount. A document with no real date is counted in `dropped`, not replaced with a blank row.
 * The page sorts by date.
 */
export function subscribeToCoachNotes(
  db: Firestore,
  userId: string,
  onData: (snapshot: CoachNoteSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    journalCoachNotesCollectionRef(db, userId),
    (snapshot) => {
      const notes = snapshot.docs.flatMap((entry) => {
        const note = coachNoteFromDocument(entry.id, entry.data());
        return note ? [note] : [];
      });
      onData({ notes, dropped: snapshot.docs.length - notes.length });
    },
    onError,
  );
}

/** `addDoc` assigns the id. A date that is not a real day is refused and nothing is written. */
export async function createCoachNote(
  db: Firestore,
  userId: string,
  input: CoachNoteInput,
  now: string,
): Promise<{ ok: true; id: string } | { ok: false; field: CoachNoteWriteFailure }> {
  const built = buildCoachNoteWrite(input, { now, creating: true });
  if (!built.ok) return built;
  const ref = await addDoc(journalCoachNotesCollectionRef(db, userId), toFirestoreData(built.data));
  return { ok: true, id: ref.id };
}

/** Merge the edited fields and `updatedAt`. `createdAt` is not sent, so the original time stays. */
export async function updateCoachNote(
  db: Firestore,
  userId: string,
  noteId: string,
  input: CoachNoteInput,
  now: string,
): Promise<{ ok: true } | { ok: false; field: CoachNoteWriteFailure }> {
  const built = buildCoachNoteWrite(input, { now, creating: false });
  if (!built.ok) return built;
  await setDoc(journalCoachNoteRef(db, userId, noteId), toFirestoreData(built.data), { merge: true });
  return { ok: true };
}

/** Ownership is the rules' job. This does not read the note first, and it does not touch a linked session. */
export async function deleteCoachNote(db: Firestore, userId: string, noteId: string): Promise<void> {
  await deleteDoc(journalCoachNoteRef(db, userId, noteId));
}
