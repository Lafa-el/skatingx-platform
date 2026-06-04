import { enableIndexedDbPersistence, type Firestore } from "firebase/firestore";

let persistenceAttempted = false;
let persistenceEnabled = false;

export type PersistenceInitResult =
  | { enabled: true }
  | { enabled: false };

const PERSISTENCE_LOG_PREFIX = "[skatingx/firestore]";

function logPersistenceSkipped(message: string, level: "info" | "warn" = "info") {
  if (level === "warn") {
    console.warn(`${PERSISTENCE_LOG_PREFIX} ${message}`);
  } else {
    console.info(`${PERSISTENCE_LOG_PREFIX} ${message}`);
  }
}

/**
 * Enable offline cache once per app load. Safe to call multiple times.
 * Skips when another tab holds the persistence lock (failed-precondition).
 * Skips are logged to the console only — not surfaced in UI.
 */
export async function initFirestorePersistence(
  db: Firestore,
): Promise<PersistenceInitResult> {
  if (persistenceAttempted) {
    return persistenceEnabled ? { enabled: true } : { enabled: false };
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
      logPersistenceSkipped(
        "Offline cache skipped: Firestore persistence is active in another tab. This tab continues online.",
      );
      return { enabled: false };
    }
    if (code === "unimplemented") {
      logPersistenceSkipped(
        "Offline cache skipped: IndexedDB persistence is not supported in this browser.",
      );
      return { enabled: false };
    }

    logPersistenceSkipped(
      `Offline cache skipped: persistence failed (${code}).`,
      "warn",
    );
    return { enabled: false };
  }
}

export function isPersistenceEnabled(): boolean {
  return persistenceEnabled;
}
