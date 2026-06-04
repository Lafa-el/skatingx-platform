import { enableIndexedDbPersistence, type Firestore } from "firebase/firestore";

let persistenceAttempted = false;
let persistenceEnabled = false;

export type PersistenceInitResult =
  | { enabled: true }
  | { enabled: false; reason: string };

/**
 * Enable offline cache once per app load. Safe to call multiple times.
 * Skips when another tab holds the persistence lock (failed-precondition).
 */
export async function initFirestorePersistence(
  db: Firestore,
): Promise<PersistenceInitResult> {
  if (persistenceAttempted) {
    return persistenceEnabled
      ? { enabled: true }
      : { enabled: false, reason: "Persistence already skipped this session." };
  }
  persistenceAttempted = true;

  try {
    await enableIndexedDbPersistence(db);
    persistenceEnabled = true;
    return { enabled: true };
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string"
        ? (error as { code: string }).code
        : "unknown";

    if (code === "failed-precondition") {
      return {
        enabled: false,
        reason:
          "IndexedDB persistence unavailable: Firestore is open in another tab.",
      };
    }
    if (code === "unimplemented") {
      return {
        enabled: false,
        reason: "IndexedDB persistence is not supported in this browser.",
      };
    }

    return {
      enabled: false,
      reason: `Persistence failed: ${code}`,
    };
  }
}

export function isPersistenceEnabled(): boolean {
  return persistenceEnabled;
}
