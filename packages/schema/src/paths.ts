import { PLATFORM_APP_ID } from "./constants";

const prefix = (userId: string) =>
  `artifacts/${PLATFORM_APP_ID}/users/${userId}` as const;

export const paths = {
  userSettings: (userId: string) => `${prefix(userId)}/settings/main`,
  athleteProfile: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/profile/main`,
  athleteGamification: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/gamification/main`,
  /**
   * Blueprint: `training/state/main`. Firestore requires an even segment count;
   * `training/state/main` is 9 segments, so the state doc is `training/state`.
   */
  trainingState: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/state`,
  /** Under `training` module; 10 segments via `training/main/taskHistory/{dateId}`. */
  taskHistory: (userId: string, athleteId: string, dateId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/main/taskHistory/${dateId}`,
  /** Parent of the existing per-day documents. Not a new store. */
  taskHistoryCollection: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/main/taskHistory`,
  /**
   * Blueprint: `training/records/{distanceId}` (9 segments if literal).
   * Valid path: `training/main/records/{distanceId}` (10 segments).
   */
  trainingRecord: (userId: string, athleteId: string, distanceId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/main/records/${distanceId}`,
  trainingRecordsCollection: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/main/records`,
  trainingRace: (userId: string, athleteId: string, raceId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/races/${raceId}`,
  trainingRewardsCatalog: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/main/rewards/catalog`,
  trainingRedemption: (userId: string, athleteId: string, redemptionId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/main/redemptions/${redemptionId}`,
  trainingRedemptionsCollection: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/main/redemptions`,
  equipmentRecord: (userId: string, athleteId: string, recordId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/equipment/records/${recordId}`,
  /**
   * ADR-005 §1. Equipment history, 10 segments, same shape as training records.
   * `equipmentRecord` above is the unused 9-segment path and must not be used for this.
   */
  equipmentHistoryRecord: (userId: string, athleteId: string, recordId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/equipment/main/records/${recordId}`,
  equipmentHistoryCollection: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/equipment/main/records`,
  /**
   * ADR-005 §1. One pace or biomechanics run, user-level, 6 segments.
   * `analysisSession` below is a different unused path and must not be used for this.
   */
  analysisRecord: (userId: string, analysisId: string) =>
    `${prefix(userId)}/analyses/${analysisId}`,
  /** Parent of `analysisRecord`. The collection already exists; this is not a new store. */
  analysesCollection: (userId: string) => `${prefix(userId)}/analyses`,
  analysisSession: (userId: string, athleteId: string, sessionId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/analysis/sessions/${sessionId}/summary`,
  planningCompletedTask: (userId: string, athleteId: string, taskId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/planning/completedTasks/${taskId}`,
  /**
   * ADR-005 §1 and §3. Plan check-in, 10 segments, same shape as training records.
   * `planningCompletedTask` above is the unused 9-segment path and must not be used for this.
   */
  planningCheckIn: (userId: string, athleteId: string, taskId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/planning/main/completedTasks/${taskId}`,
  planningCheckInsCollection: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/planning/main/completedTasks`,

  // Race Day Companion (ADR-001 D6). Account-scoped, not athlete-scoped: the roster
  // holds followed athletes as well as the user's own.
  raceDayEvent: (userId: string, eventId: string) =>
    `${prefix(userId)}/raceDay/${eventId}`,
  raceDayEventsCollection: (userId: string) => `${prefix(userId)}/raceDay`,
  raceDayRoster: (userId: string, eventId: string, rosterId: string) =>
    `${prefix(userId)}/raceDay/${eventId}/roster/${rosterId}`,
  raceDayRosterCollection: (userId: string, eventId: string) =>
    `${prefix(userId)}/raceDay/${eventId}/roster`,
  raceDayRace: (userId: string, eventId: string, raceId: string) =>
    `${prefix(userId)}/raceDay/${eventId}/races/${raceId}`,
  raceDayRacesCollection: (userId: string, eventId: string) =>
    `${prefix(userId)}/raceDay/${eventId}/races`,
  raceDayResult: (userId: string, eventId: string, resultId: string) =>
    `${prefix(userId)}/raceDay/${eventId}/results/${resultId}`,
  raceDayResultsCollection: (userId: string, eventId: string) =>
    `${prefix(userId)}/raceDay/${eventId}/results`,
  raceDayVideo: (userId: string, eventId: string, videoId: string) =>
    `${prefix(userId)}/raceDay/${eventId}/videos/${videoId}`,
  raceDayVideosCollection: (userId: string, eventId: string) =>
    `${prefix(userId)}/raceDay/${eventId}/videos`,
  raceDaySummary: (userId: string, eventId: string) =>
    `${prefix(userId)}/raceDay/${eventId}/summaries/main`,
} as const;

/** Split a path string into Firestore `doc()` segments. */
export function pathToSegments(path: string): string[] {
  return path.split("/");
}
