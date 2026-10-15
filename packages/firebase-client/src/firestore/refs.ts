import {
  collection,
  doc,
  type CollectionReference,
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

export function taskHistoryRef(
  db: Firestore,
  userId: string,
  athleteId: string,
  dateId: string,
): DocumentReference {
  return docFromPath(db, paths.taskHistory(userId, athleteId, dateId));
}

export function trainingRecordRef(
  db: Firestore,
  userId: string,
  athleteId: string,
  distanceId: string,
): DocumentReference {
  return docFromPath(db, paths.trainingRecord(userId, athleteId, distanceId));
}

export function trainingRecordsCollectionRef(
  db: Firestore,
  userId: string,
  athleteId: string,
): CollectionReference {
  const segments = pathToSegments(
    paths.trainingRecordsCollection(userId, athleteId),
  );
  return collection(db, ...(segments as [string, ...string[]]));
}

export function trainingRewardsCatalogRef(
  db: Firestore,
  userId: string,
  athleteId: string,
): DocumentReference {
  return docFromPath(db, paths.trainingRewardsCatalog(userId, athleteId));
}

export function trainingRedemptionRef(
  db: Firestore,
  userId: string,
  athleteId: string,
  redemptionId: string,
): DocumentReference {
  return docFromPath(
    db,
    paths.trainingRedemption(userId, athleteId, redemptionId),
  );
}

export function trainingRedemptionsCollectionRef(
  db: Firestore,
  userId: string,
  athleteId: string,
): CollectionReference {
  const segments = pathToSegments(
    paths.trainingRedemptionsCollection(userId, athleteId),
  );
  return collection(db, ...(segments as [string, ...string[]]));
}

// --- Race Day (ADR-001 D6) ----------------------------------------------------------

export function raceDayEventRef(
  db: Firestore,
  userId: string,
  eventId: string,
): DocumentReference {
  return docFromPath(db, paths.raceDayEvent(userId, eventId));
}

export function raceDayEventsCollectionRef(
  db: Firestore,
  userId: string,
): CollectionReference {
  const segments = pathToSegments(paths.raceDayEventsCollection(userId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function raceDayRosterRef(
  db: Firestore,
  userId: string,
  eventId: string,
  rosterId: string,
): DocumentReference {
  return docFromPath(db, paths.raceDayRoster(userId, eventId, rosterId));
}

export function raceDayRosterCollectionRef(
  db: Firestore,
  userId: string,
  eventId: string,
): CollectionReference {
  const segments = pathToSegments(paths.raceDayRosterCollection(userId, eventId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function raceDayRaceRef(
  db: Firestore,
  userId: string,
  eventId: string,
  raceId: string,
): DocumentReference {
  return docFromPath(db, paths.raceDayRace(userId, eventId, raceId));
}

export function raceDayRacesCollectionRef(
  db: Firestore,
  userId: string,
  eventId: string,
): CollectionReference {
  const segments = pathToSegments(paths.raceDayRacesCollection(userId, eventId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function raceDayResultRef(
  db: Firestore,
  userId: string,
  eventId: string,
  resultId: string,
): DocumentReference {
  return docFromPath(db, paths.raceDayResult(userId, eventId, resultId));
}

export function raceDayResultsCollectionRef(
  db: Firestore,
  userId: string,
  eventId: string,
): CollectionReference {
  const segments = pathToSegments(paths.raceDayResultsCollection(userId, eventId));
  return collection(db, ...(segments as [string, ...string[]]));
}
