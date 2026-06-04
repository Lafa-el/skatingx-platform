import { PLATFORM_APP_ID } from "./constants";

export const paths = {
  userSettings: (userId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/settings/main`,
  athleteProfile: (userId: string, athleteId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/profile/main`,
  athleteGamification: (userId: string, athleteId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/gamification/main`,
  trainingState: (userId: string, athleteId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/training/state/main`,
  trainingTaskHistory: (userId: string, athleteId: string, dateId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/training/taskHistory/${dateId}`,
  trainingRecord: (userId: string, athleteId: string, distanceId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/training/records/${distanceId}`,
  trainingRace: (userId: string, athleteId: string, raceId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/training/races/${raceId}`,
  trainingRewardsCatalog: (userId: string, athleteId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/training/rewards/catalog`,
  equipmentRecord: (userId: string, athleteId: string, recordId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/equipment/records/${recordId}`,
  analysisSession: (userId: string, athleteId: string, sessionId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/analysis/sessions/${sessionId}/summary`,
  planningCompletedTask: (userId: string, athleteId: string, taskId: string) =>
    `artifacts/${PLATFORM_APP_ID}/users/${userId}/athletes/${athleteId}/planning/completedTasks/${taskId}`,
} as const;
