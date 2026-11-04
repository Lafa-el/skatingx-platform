import { deleteField, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
import { deleteObject, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

import { athleteProfileRef } from "../firestore/refs";
import { getFirebaseStorage } from "./client";

/** Rules use the same bound: `request.resource.size < 5 * 1024 * 1024`. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** One object per athlete. A new photo overwrites this name, so no old file is left behind. */
export function athleteAvatarPath(userId: string, athleteId: string): string {
  return `avatars/${userId}/${athleteId}/avatar`;
}

export function avatarFileProblem(file: { type: string; size: number }): "type" | "size" | null {
  if (!file.type.startsWith("image/")) {
    return "type";
  }
  if (file.size >= AVATAR_MAX_BYTES) {
    return "size";
  }
  return null;
}

export async function uploadAthleteAvatar(
  db: Firestore,
  storage: FirebaseStorage,
  userId: string,
  athleteId: string,
  file: Blob & { type: string; size: number },
): Promise<string> {
  const problem = avatarFileProblem(file);
  if (problem) {
    throw new Error(problem === "type" ? "avatar-type" : "avatar-size");
  }
  const path = athleteAvatarPath(userId, athleteId);
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  await setDoc(
    athleteProfileRef(db, userId, athleteId),
    { avatarStoragePath: path, updatedAt: serverTimestamp() },
    { merge: true },
  );
  return path;
}

/** Removes the file, then the field. The form patch never carries this field. */
export async function deleteAthleteAvatar(
  db: Firestore,
  storage: FirebaseStorage,
  userId: string,
  athleteId: string,
): Promise<void> {
  await removeAvatarObject(athleteAvatarPath(userId, athleteId), storage);
  await setDoc(
    athleteProfileRef(db, userId, athleteId),
    { avatarStoragePath: deleteField(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Delete the stored object. A missing object is already gone, so a retry can continue.
 * Any other failure is rethrown and the caller must not touch Firestore yet.
 */
export async function removeAvatarObject(
  path: string,
  storage: FirebaseStorage | null = getFirebaseStorage(),
): Promise<void> {
  if (!storage) {
    throw new Error("storage-unavailable");
  }
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code !== "storage/object-not-found") {
      throw error;
    }
  }
}
