import { addDoc, deleteDoc, getDoc, onSnapshot, orderBy, query, setDoc, type Firestore } from "firebase/firestore";

import { videoEntriesCollectionRef, videoEntryRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/** Preset tags copied from the old video library. Stored values stay these spellings. */
export const VIDEO_TAGS = [
  "edge",
  "turn",
  "jump",
  "spin",
  "footwork",
  "flow",
  "step_sequence",
  "combo",
  "alignment",
  "speed",
  "other",
] as const;

export type VideoTag = (typeof VIDEO_TAGS)[number];

/**
 * One row in the user-level video library. There is no date: the list sorts by `createdAt`.
 * Whether it has been analysed is derived from saved analyses, not stored here.
 */
export type VideoEntryRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  fileName?: string;
  externalUrl?: string;
  technicalTags?: string[];
  linkedSessionId?: string;
  notes?: string;
};

export type VideoEntryInput = {
  title?: string;
  fileName?: string;
  externalUrl?: string;
  technicalTags?: readonly string[];
  linkedSessionId?: string;
  notes?: string;
};

export type VideoEntryWrite = {
  title: string;
  updatedAt: string;
  fileName?: string;
  externalUrl?: string;
  technicalTags?: string[];
  linkedSessionId?: string;
  notes?: string;
  createdAt?: string;
};

export type VideoWriteFailure = "title" | "externalUrl";

export type VideoSnapshot = {
  videos: readonly VideoEntryRecord[];
  dropped: number;
};

const TAG_SET = new Set<string>(VIDEO_TAGS);

function presentText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isWebUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function presentTags(value: readonly string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const selected = new Set(value);
  const kept = VIDEO_TAGS.filter((tag) => selected.has(tag));
  return kept.length > 0 ? [...kept] : undefined;
}

function tagsFromDocument(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kept = value.filter((tag): tag is string => typeof tag === "string" && TAG_SET.has(tag));
  return kept.length > 0 ? kept : undefined;
}

/** A library document, or null when it has no title or no `createdAt`. */
export function videoEntryFromDocument(id: string, data: unknown): VideoEntryRecord | null {
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  const title = presentText(fields.title);
  const createdAt = typeof fields.createdAt === "string" && fields.createdAt.trim().length > 0 ? fields.createdAt : undefined;
  if (!title || !createdAt) return null;
  const updatedAt =
    typeof fields.updatedAt === "string" && fields.updatedAt.trim().length > 0 ? fields.updatedAt : createdAt;
  const record: VideoEntryRecord = { id, title, createdAt, updatedAt };
  const fileName = presentText(fields.fileName);
  const externalUrl = presentText(fields.externalUrl);
  const technicalTags = tagsFromDocument(fields.technicalTags);
  const linkedSessionId = presentText(fields.linkedSessionId);
  const notes = presentText(fields.notes);
  if (fileName !== undefined) record.fileName = fileName;
  if (externalUrl !== undefined) record.externalUrl = externalUrl;
  if (technicalTags !== undefined) record.technicalTags = technicalTags;
  if (linkedSessionId !== undefined) record.linkedSessionId = linkedSessionId;
  if (notes !== undefined) record.notes = notes;
  return record;
}

/**
 * A non-empty title is the only hard text check. A non-empty external URL must start with
 * `http://` or `https://`. Blank text and tags outside the preset stay off the document.
 * A new entry also gets `createdAt`; an edit only moves `updatedAt`.
 */
export function buildVideoWrite(
  input: VideoEntryInput,
  options: { now: string; creating: boolean },
): { ok: true; data: VideoEntryWrite } | { ok: false; field: VideoWriteFailure } {
  const title = presentText(input.title);
  if (!title) return { ok: false, field: "title" };
  const externalUrl = presentText(input.externalUrl);
  if (externalUrl !== undefined && !isWebUrl(externalUrl)) return { ok: false, field: "externalUrl" };
  const data: VideoEntryWrite = { title, updatedAt: options.now };
  const fileName = presentText(input.fileName);
  const technicalTags = presentTags(input.technicalTags);
  const linkedSessionId = presentText(input.linkedSessionId);
  const notes = presentText(input.notes);
  if (fileName !== undefined) data.fileName = fileName;
  if (externalUrl !== undefined) data.externalUrl = externalUrl;
  if (technicalTags !== undefined) data.technicalTags = technicalTags;
  if (linkedSessionId !== undefined) data.linkedSessionId = linkedSessionId;
  if (notes !== undefined) data.notes = notes;
  if (options.creating) data.createdAt = options.now;
  return { ok: true, data };
}

/** `addDoc` assigns the id. A blank title or a non-web URL is refused and nothing is written. */
export async function createVideo(
  db: Firestore,
  userId: string,
  input: VideoEntryInput,
  now: string,
): Promise<{ ok: true; id: string } | { ok: false; field: VideoWriteFailure }> {
  const built = buildVideoWrite(input, { now, creating: true });
  if (!built.ok) return built;
  const ref = await addDoc(videoEntriesCollectionRef(db, userId), toFirestoreData(built.data));
  return { ok: true, id: ref.id };
}

/** Merge the edited fields and `updatedAt`. `createdAt` is not sent, so the original time stays. */
export async function updateVideo(
  db: Firestore,
  userId: string,
  videoId: string,
  input: VideoEntryInput,
  now: string,
): Promise<{ ok: true } | { ok: false; field: VideoWriteFailure }> {
  const built = buildVideoWrite(input, { now, creating: false });
  if (!built.ok) return built;
  await setDoc(videoEntryRef(db, userId, videoId), toFirestoreData(built.data), { merge: true });
  return { ok: true };
}

/** Ownership is the rules' job. This does not read the entry first, and it does not touch an analysis. */
export async function deleteVideo(db: Firestore, userId: string, videoId: string): Promise<void> {
  await deleteDoc(videoEntryRef(db, userId, videoId));
}

/** One library entry. A missing document is `null`, not a thrown error. */
export async function getVideoEntry(db: Firestore, userId: string, videoId: string): Promise<VideoEntryRecord | null> {
  const snapshot = await getDoc(videoEntryRef(db, userId, videoId));
  if (!snapshot.exists()) return null;
  return videoEntryFromDocument(snapshot.id, snapshot.data());
}

/**
 * The user's video library, newest `createdAt` first. The page breaks remaining ties by id.
 * A document with no title or `createdAt` is counted in `dropped`, not shown blank.
 */
export function subscribeToVideos(
  db: Firestore,
  userId: string,
  onData: (snapshot: VideoSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  const videos = query(videoEntriesCollectionRef(db, userId), orderBy("createdAt", "desc"));
  return onSnapshot(
    videos,
    (snapshot) => {
      const readable = snapshot.docs.flatMap((entry) => {
        const video = videoEntryFromDocument(entry.id, entry.data());
        return video ? [video] : [];
      });
      onData({ videos: readable, dropped: snapshot.docs.length - readable.length });
    },
    onError,
  );
}
