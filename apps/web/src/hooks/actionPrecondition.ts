import { getFirestoreDb } from "@skatingx/firebase-client";
import type { Firestore } from "firebase/firestore";

export type PreconditionKind = "notSignedIn" | "unavailable";

/**
 * Thrown when an action cannot start at all: nobody is signed in, or the data service is not
 * there. It carries which of the two, not a sentence, so each hook can show its own text in the
 * user's language. It is thrown inside the hook's own try block, so the user sees it like any
 * other failure instead of the button doing nothing.
 */
export class ActionPreconditionError extends Error {
  constructor(readonly kind: PreconditionKind) {
    super(kind);
    this.name = "ActionPreconditionError";
  }
}

export function requireActor(uid: string | null | undefined): { db: Firestore; userId: string } {
  if (!uid) {
    throw new ActionPreconditionError("notSignedIn");
  }
  const db = getFirestoreDb();
  if (!db) {
    throw new ActionPreconditionError("unavailable");
  }
  return { db, userId: uid };
}
