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
  analysisSession: (userId: string, athleteId: string, sessionId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/analysis/sessions/${sessionId}/summary`,
  planningCompletedTask: (userId: string, athleteId: string, taskId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/planning/completedTasks/${taskId}`,
} as const;

/** Split a path string into Firestore `doc()` segments. */
export function pathToSegments(path: string): string[] {
  return path.split("/");
}
