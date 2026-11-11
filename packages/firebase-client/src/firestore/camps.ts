import { isRealDateString } from "@skatingx/skating-domain";
import { addDoc, deleteDoc, getDoc, onSnapshot, orderBy, query, setDoc, type Firestore } from "firebase/firestore";

import { campRef, campsCollectionRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/** Suggested camp types for the form. Stored type is free text, not limited to this list. */
export const CAMP_TYPES = ["夏令营", "冬令营", "回国集训", "赛前集训", "海外拉练"] as const;

export type CampTypeSuggestion = (typeof CAMP_TYPES)[number];

/** One camp. Stats are computed later from other records; this document does not own sessions. */
export type CampRecord = {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  location?: string;
};

export type CampInput = {
  name?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
};

export type CampWrite = {
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  updatedAt: string;
  location?: string;
  createdAt?: string;
};

export type CampWriteFailure = "name" | "type" | "dates" | "location";

export type CampSnapshot = {
  camps: readonly CampRecord[];
  dropped: number;
};

function presentText(value: unknown, max?: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (max !== undefined && trimmed.length > max) return undefined;
  return trimmed;
}

function boundedText(value: string | undefined, min: number, max: number): string | undefined {
  const text = presentText(value, max);
  if (text === undefined || text.length < min) return undefined;
  return text;
}

/** Newest start date first. The same start date is ordered by id descending. */
export function compareCamps(a: CampRecord, b: CampRecord): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * A camp document, or null when a required field is missing or a date is not a real day.
 * The caller counts null as dropped.
 */
export function campFromDocument(id: string, data: unknown): CampRecord | null {
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  const name = presentText(fields.name);
  const type = presentText(fields.type);
  const startDate = typeof fields.startDate === "string" ? fields.startDate.trim() : "";
  const endDate = typeof fields.endDate === "string" ? fields.endDate.trim() : "";
  const createdAt = typeof fields.createdAt === "string" ? fields.createdAt.trim() : "";
  if (!name || !type || !createdAt) return null;
  if (!isRealDateString(startDate) || !isRealDateString(endDate)) return null;
  const updatedAt = typeof fields.updatedAt === "string" && fields.updatedAt.trim().length > 0 ? fields.updatedAt : createdAt;
  const record: CampRecord = { id, name, type, startDate, endDate, createdAt, updatedAt };
  const location = presentText(fields.location);
  if (location !== undefined) record.location = location;
  return record;
}

/**
 * Name is 1–80 characters and type is 1–40, after trimming. Both dates must be real days and
 * the start cannot be after the end. A blank location stays off the document; one longer than
 * 200 characters is refused.
 */
export function buildCampWrite(
  input: CampInput,
  options: { now: string; creating: boolean },
): { ok: true; data: CampWrite } | { ok: false; field: CampWriteFailure } {
  const name = boundedText(input.name, 1, 80);
  if (!name) return { ok: false, field: "name" };
  const type = boundedText(input.type, 1, 40);
  if (!type) return { ok: false, field: "type" };
  const startDate = input.startDate?.trim() ?? "";
  const endDate = input.endDate?.trim() ?? "";
  if (!isRealDateString(startDate) || !isRealDateString(endDate) || startDate > endDate) {
    return { ok: false, field: "dates" };
  }
  const rawLocation = presentText(input.location);
  if (rawLocation !== undefined && rawLocation.length > 200) return { ok: false, field: "location" };
  const data: CampWrite = { name, type, startDate, endDate, updatedAt: options.now };
  if (rawLocation !== undefined) data.location = rawLocation;
  if (options.creating) data.createdAt = options.now;
  return { ok: true, data };
}

/** `addDoc` assigns the id. A failed check writes nothing. */
export async function createCamp(
  db: Firestore,
  userId: string,
  input: CampInput,
  now: string,
): Promise<{ ok: true; id: string } | { ok: false; field: CampWriteFailure }> {
  const built = buildCampWrite(input, { now, creating: true });
  if (!built.ok) return built;
  const ref = await addDoc(campsCollectionRef(db, userId), toFirestoreData(built.data));
  return { ok: true, id: ref.id };
}

/** Merge the edited fields and `updatedAt`. `createdAt` is not sent, so the original time stays. */
export async function updateCamp(
  db: Firestore,
  userId: string,
  campId: string,
  input: CampInput,
  now: string,
): Promise<{ ok: true } | { ok: false; field: CampWriteFailure }> {
  const built = buildCampWrite(input, { now, creating: false });
  if (!built.ok) return built;
  await setDoc(campRef(db, userId, campId), toFirestoreData(built.data), { merge: true });
  return { ok: true };
}

/** Ownership is the rules' job. Deleting a camp does not delete sessions or journal rows. */
export async function deleteCamp(db: Firestore, userId: string, campId: string): Promise<void> {
  await deleteDoc(campRef(db, userId, campId));
}

/** One camp. A missing or unreadable document is `null`. */
export async function getCamp(db: Firestore, userId: string, campId: string): Promise<CampRecord | null> {
  const snapshot = await getDoc(campRef(db, userId, campId));
  if (!snapshot.exists()) return null;
  return campFromDocument(snapshot.id, snapshot.data());
}

/**
 * The user's camps, newest `startDate` first, then id. A document that cannot be read is
 * counted in `dropped`, not shown blank.
 */
export function subscribeToCamps(
  db: Firestore,
  userId: string,
  onData: (snapshot: CampSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  const camps = query(campsCollectionRef(db, userId), orderBy("startDate", "desc"));
  return onSnapshot(
    camps,
    (snapshot) => {
      const readable = snapshot.docs.flatMap((entry) => {
        const camp = campFromDocument(entry.id, entry.data());
        return camp ? [camp] : [];
      });
      onData({ camps: readable.sort(compareCamps), dropped: snapshot.docs.length - readable.length });
    },
    onError,
  );
}
