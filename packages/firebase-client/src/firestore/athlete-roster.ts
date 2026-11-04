import { PLATFORM_APP_ID } from "@skatingx/schema";
import {
  collectionGroup,
  documentId,
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
 * Every profile under this user. A collection-group read is scoped with the document
 * path so another user's profiles are not part of the query. The parent athlete
 * document is not listed: bootstrap never creates it.
 */
export function subscribeToAthleteProfiles(
  db: Firestore,
  userId: string,
  onData: (entries: AthleteRosterEntry[]) => void,
  onError: (message: string) => void,
): { unsubscribe: () => void } {
  // documentId() on a collection group must be a full document path (even segment
  // count). The bounds sit around `{athleteId}/profile/main` under this user.
  const root = `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/`;
  const roster = query(
    collectionGroup(db, "profile"),
    where(documentId(), ">=", `${root}\u0000/profile/main`),
    where(documentId(), "<", `${root}\uf8ff/profile/main`),
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
