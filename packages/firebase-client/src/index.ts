export { getFirebaseApp, initFirebase } from "./app";
export { bootstrapUserDocuments, type BootstrapResult } from "./firestore/bootstrap";
export { getFirestoreDb } from "./firestore/db";
export {
  initFirestorePersistence,
  isPersistenceEnabled,
  type PersistenceInitResult,
} from "./firestore/persistence";
export {
  athleteGamificationRef,
  athleteProfileRef,
  raceDayEventRef,
  raceDayEventsCollectionRef,
  raceDayRaceRef,
  raceDayRacesCollectionRef,
  raceDayResultRef,
  raceDayResultsCollectionRef,
  raceDayRosterCollectionRef,
  raceDayRosterRef,
  raceDaySummaryRef,
  raceDayVideoRef,
  raceDayVideosCollectionRef,
  settingsRef,
  taskHistoryRef,
  trainingRecordRef,
  trainingRecordsCollectionRef,
  trainingRedemptionRef,
  trainingRedemptionsCollectionRef,
  trainingRewardsCatalogRef,
  trainingStateRef,
} from "./firestore/refs";
export {
  createRace,
  createRaceEvent,
  createRaceEventWithRaces,
  createRaceResult,
  createRaceSummary,
  createRaceVideo,
  createRosterEntry,
  deleteRace,
  deleteRaceEvent,
  deleteRaceResult,
  deleteRaceSummary,
  deleteRaceVideo,
  deleteRosterEntry,
  RaceDayValidationError,
  setRaceEventVerified,
  setRaceResultVerified,
  setRaceVerified,
  setRosterEntryVerified,
  subscribeToRaceEvents,
  subscribeToRaceResults,
  subscribeToRaces,
  subscribeToRaceSummary,
  subscribeToRaceVideos,
  subscribeToRoster,
  updateRace,
  updateRaceEvent,
  updateRaceResult,
  updateRaceSummary,
  updateRaceVideo,
  updateRosterEntry,
  type InvalidRaceDayDocument,
  type RaceDayContext,
  type RaceDayList,
  type RaceDayListError,
  type RaceSummaryState,
} from "./firestore/race-day";
export { updateUserSettings } from "./firestore/settings";
export {
  ensureDefaultRewardsCatalog,
  normalizeRewardsCatalog,
  redeemReward,
  type RedeemRewardResult,
  type RewardsActorContext,
} from "./firestore/training-rewards";
export {
  addTimeEntry,
  deleteTimeEntry,
  ensureDefaultDistanceRecords,
  readDistanceRecordsDocument,
  updateTimeEntry,
  type RecordsActorContext,
} from "./firestore/training-records";
export {
  addTrainingTask,
  deleteTrainingTask,
  importAcademyTasks,
  normalizeTrainingState,
  runDayRolloverIfNeeded,
  toggleTrainingTask,
  type AcademyImportResult,
  type TrainingActorContext,
} from "./firestore/training-tasks";
export {
  sanitizeForFirestore,
  serializeTimeEntry,
  serializeTrainingTask,
} from "./firestore/sanitize";
export { subscribeToDocument } from "./firestore/subscribe";
export {
  getAuthErrorMessage,
  getFirebaseAuth,
  linkAnonymousWithEmailPassword,
  refreshAuthUser,
  signInAnonymouslyIfNeeded,
  signInWithEmailPassword,
  signOutUser,
  subscribeToAuthState,
  type User,
} from "./auth";
export { readFirebaseConfigFromEnv, isFirebaseConfigComplete } from "./config";
export type { FirebaseEnvKey } from "./config";
export {
  hasPasswordProvider,
  isAnonymousUser,
  isRegisteredUser,
  userNeedsAuthRefresh,
} from "./user";
