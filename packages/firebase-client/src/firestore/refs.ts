import {
  doc,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { pathToSegments, paths } from "@skatingx/schema";

function docFromPath(db: Firestore, path: string): DocumentReference {
  const segments = pathToSegments(path);
  return doc(db, ...(segments as [string, ...string[]]));
}

export function settingsRef(
  db: Firestore,
  userId: string,
): DocumentReference {
  return docFromPath(db, paths.userSettings(userId));
}

export function athleteProfileRef(
  db: Firestore,
  userId: string,
  athleteId: string,
): DocumentReference {
  return docFromPath(db, paths.athleteProfile(userId, athleteId));
}

export function athleteGamificationRef(
  db: Firestore,
  userId: string,
  athleteId: string,
): DocumentReference {
  return docFromPath(db, paths.athleteGamification(userId, athleteId));
}

export function trainingStateRef(
  db: Firestore,
  userId: string,
  athleteId: string,
): DocumentReference {
  return docFromPath(db, paths.trainingState(userId, athleteId));
}
