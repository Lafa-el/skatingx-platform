import {
  collectionGroup,
  onSnapshot,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

export type AthleteRosterEntry = {
  athleteId: string;
  displayName: string;
};

/**
 * `athletes/{athleteId}/profile/main`: the athlete id is the document above `profile`,
 * not a field we have to trust, and not the `athletes` collection (those parent docs
 * are not written).
 */
export function athleteIdFromProfilePath(path: string): string | null {
  const parts = path.split("/").filter((part) => part !== "");
  const document = parts.at(-1);
  const collection = parts.at(-2);
  const athleteId = parts.at(-3);
  const athletes = parts.at(-4);
  if (document !== "main" || collection !== "profile" || athletes !== "athletes" || !athleteId) {
    return null;
  }
  return athleteId;
}

/**
 * Every profile stamped with this user's id. A collection-group list cannot see
 * the parent path, so the query filters on `userId`. The parent athlete document
 * is not listed: bootstrap never creates it.
 */
export function subscribeToAthleteProfiles(
  db: Firestore,
  userId: string,
  onData: (entries: AthleteRosterEntry[]) => void,
  onError: (message: string) => void,
): { unsubscribe: () => void } {
  const roster = query(
    collectionGroup(db, "profile"),
    where("userId", "==", userId),
  );
  const unsubscribe = onSnapshot(
    roster,
    (snap) => {
      const entries: AthleteRosterEntry[] = [];
      for (const docSnap of snap.docs) {
        const athleteId = athleteIdFromProfilePath(docSnap.ref.path);
        if (!athleteId) {
          continue;
        }
        const raw = docSnap.data() as { displayName?: unknown };
        const displayName =
          typeof raw.displayName === "string" && raw.displayName.trim() !== ""
            ? raw.displayName
            : athleteId;
        entries.push({ athleteId, displayName });
      }
      entries.sort(
        (a, b) => a.displayName.localeCompare(b.displayName) || a.athleteId.localeCompare(b.athleteId),
      );
      onData(entries);
    },
    (error) => {
      onError(error.message);
    },
  );
  return { unsubscribe };
}
