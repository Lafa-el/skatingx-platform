import { PLATFORM_APP_ID } from "./constants";

const prefix = (userId: string) =>
  `artifacts/${PLATFORM_APP_ID}/users/${userId}` as const;

export const paths = {
  userSettings: (userId: string) => `${prefix(userId)}/settings/main`,
  athleteProfile: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/profile/main`,
  athleteGamification: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/gamification/main`,
  trainingState: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/trainingState/main`,
  trainingTaskHistory: (userId: string, athleteId: string, dateId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/taskHistory/${dateId}`,
  trainingRecord: (userId: string, athleteId: string, distanceId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/records/${distanceId}`,
  trainingRace: (userId: string, athleteId: string, raceId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/races/${raceId}`,
  trainingRewardsCatalog: (userId: string, athleteId: string) =>
    `${prefix(userId)}/athletes/${athleteId}/training/rewards/catalog`,
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
