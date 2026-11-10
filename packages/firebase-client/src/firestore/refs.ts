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

export function equipmentHistoryRecordRef(
  db: Firestore,
  userId: string,
  athleteId: string,
  recordId: string,
): DocumentReference {
  return docFromPath(db, paths.equipmentHistoryRecord(userId, athleteId, recordId));
}

export function equipmentHistoryCollectionRef(
  db: Firestore,
  userId: string,
  athleteId: string,
): CollectionReference {
  const segments = pathToSegments(paths.equipmentHistoryCollection(userId, athleteId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function analysesCollectionRef(db: Firestore, userId: string): CollectionReference {
  const segments = pathToSegments(paths.analysesCollection(userId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function analysisRecordRef(
  db: Firestore,
  userId: string,
  analysisId: string,
): DocumentReference {
  return docFromPath(db, paths.analysisRecord(userId, analysisId));
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

export function pointsLedgerRef(
  db: Firestore,
  userId: string,
  athleteId: string,
  eventId: string,
): DocumentReference {
  return docFromPath(db, paths.pointsLedger(userId, athleteId, eventId));
}

export function pointsLedgerCollectionRef(
  db: Firestore,
  userId: string,
  athleteId: string,
): CollectionReference {
  const segments = pathToSegments(paths.pointsLedgerCollection(userId, athleteId));
  return collection(db, ...(segments as [string, ...string[]]));
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

export function taskHistoryCollectionRef(
  db: Firestore,
  userId: string,
  athleteId: string,
): CollectionReference {
  const segments = pathToSegments(paths.taskHistoryCollection(userId, athleteId));
  return collection(db, ...(segments as [string, ...string[]]));
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

export function raceDaySummaryRef(
  db: Firestore,
  userId: string,
  eventId: string,
): DocumentReference {
  return docFromPath(db, paths.raceDaySummary(userId, eventId));
}

export function raceDayVideoRef(
  db: Firestore,
  userId: string,
  eventId: string,
  videoId: string,
): DocumentReference {
  return docFromPath(db, paths.raceDayVideo(userId, eventId, videoId));
}

export function journalDayRef(db: Firestore, userId: string, dayId: string): DocumentReference {
  return docFromPath(db, paths.journalDay(userId, dayId));
}

export function journalDaysCollectionRef(db: Firestore, userId: string): CollectionReference {
  const segments = pathToSegments(paths.journalDaysCollection(userId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function journalSessionsCollectionRef(db: Firestore, userId: string): CollectionReference {
  const segments = pathToSegments(paths.journalSessionsCollection(userId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function journalCoachNoteRef(db: Firestore, userId: string, noteId: string): DocumentReference {
  return docFromPath(db, paths.journalCoachNote(userId, noteId));
}

export function journalCoachNotesCollectionRef(db: Firestore, userId: string): CollectionReference {
  const segments = pathToSegments(paths.journalCoachNotesCollection(userId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function journalBodyStatusRef(db: Firestore, userId: string, statusId: string): DocumentReference {
  return docFromPath(db, paths.journalBodyStatus(userId, statusId));
}

export function journalBodyStatusCollectionRef(db: Firestore, userId: string): CollectionReference {
  const segments = pathToSegments(paths.journalBodyStatusCollection(userId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function journalWeeklyReviewRef(db: Firestore, userId: string, weekStart: string): DocumentReference {
  return docFromPath(db, paths.journalWeeklyReview(userId, weekStart));
}

export function journalWeeklyReviewsCollectionRef(db: Firestore, userId: string): CollectionReference {
  const segments = pathToSegments(paths.journalWeeklyReviewsCollection(userId));
  return collection(db, ...(segments as [string, ...string[]]));
}

export function raceDayVideosCollectionRef(
  db: Firestore,
  userId: string,
  eventId: string,
): CollectionReference {
  const segments = pathToSegments(paths.raceDayVideosCollection(userId, eventId));
  return collection(db, ...(segments as [string, ...string[]]));
}
