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
  analysesCollectionRef,
  analysisRecordRef,
  equipmentHistoryCollectionRef,
  equipmentHistoryRecordRef,
  journalDayRef,
  journalDaysCollectionRef,
  journalSessionsCollectionRef,
  journalWeeklyReviewRef,
  journalWeeklyReviewsCollectionRef,
  videoEntryRef,
  videoEntriesCollectionRef,
  settingsRef,
  taskHistoryCollectionRef,
  taskHistoryRef,
  pointsLedgerCollectionRef,
  pointsLedgerRef,
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
  type RaceDaySubscribeOptions,
  type RaceSummaryState,
} from "./firestore/race-day";
export {
  reconcileRaceRecords,
  startRaceRecordSync,
  subscribeToRaceRecordEntries,
  type RaceRecordSyncFailure,
  type RaceRecordSyncHandlers,
  type RaceRecordSyncReport,
} from "./firestore/race-record-sync";
export { saveBiomechAnalysisRecord } from "./firestore/biomech-analysis";
export { savePaceAnalysisRecord } from "./firestore/pace-analysis";
export {
  getSavedAnalysis,
  subscribeToSavedAnalyses,
  type SavedAnalysisDetail,
  type SavedAnalysisFrame,
  type SavedAnalysisSource,
} from "./firestore/saved-analyses";
export {
  VIDEO_TAGS,
  buildVideoWrite,
  createVideo,
  deleteVideo,
  getVideoEntry,
  subscribeToVideos,
  updateVideo,
  videoEntryFromDocument,
  type VideoEntryInput,
  type VideoEntryRecord,
  type VideoEntryWrite,
  type VideoSnapshot,
  type VideoTag,
  type VideoWriteFailure,
} from "./firestore/videos";
export {
  deleteEquipmentHistoryRecord,
  saveEquipmentHistoryRecord,
  subscribeToEquipmentHistory,
} from "./firestore/equipment-history";
export {
  SESSION_FOCUS_TAGS,
  SESSION_TYPES,
  buildJournalDayWrite,
  buildJournalSessionWrite,
  createJournalSession,
  deleteJournalSession,
  journalDayFromDocument,
  journalSessionFromDocument,
  saveJournalDay,
  setJournalDayCompleted,
  subscribeToJournal,
  updateJournalSession,
  type JournalDayInput,
  type JournalDayRecord,
  type JournalDayWrite,
  type JournalReflection,
  type JournalSessionFocusTag,
  type JournalSessionInput,
  type JournalSessionRecord,
  type JournalSessionType,
  type JournalSessionWrite,
  type JournalSessionWriteFailure,
  type JournalSnapshot,
  type JournalWriteFailure,
} from "./firestore/journal";
export {
  COACH_NOTE_TAGS,
  buildCoachNoteWrite,
  coachNoteFromDocument,
  createCoachNote,
  deleteCoachNote,
  subscribeToCoachNotes,
  updateCoachNote,
  type CoachNoteInput,
  type CoachNotePriority,
  type CoachNoteRecord,
  type CoachNoteTag,
  type CoachNoteSnapshot,
  type CoachNoteWrite,
  type CoachNoteWriteFailure,
} from "./firestore/journal-coach-notes";
export {
  BODY_SORENESS_AREAS,
  bodyStatusFromDocument,
  buildBodyStatusWrite,
  createBodyStatus,
  deleteBodyStatus,
  subscribeToBodyStatus,
  updateBodyStatus,
  type BodyStatusInput,
  type BodyStatusRecord,
  type BodyStatusSnapshot,
  type BodyStatusSorenessArea,
  type BodyStatusWrite,
  type BodyStatusWriteFailure,
} from "./firestore/journal-body-status";
export {
  buildWeeklyReviewWrite,
  saveWeeklyReview,
  subscribeToWeeklyReview,
  weeklyReviewFromDocument,
  type WeeklyReviewInput,
  type WeeklyReviewRecord,
  type WeeklyReviewWrite,
  type WeeklyReviewWriteFailure,
} from "./firestore/journal-weekly-reviews";
export { updateUserSettings } from "./firestore/settings";
export { updateAthleteProfile, type AthleteProfilePatch } from "./firestore/athlete-profile";
export { AthleteIdCollisionError, createAthlete } from "./firestore/create-athlete";
export { deleteAthlete } from "./firestore/delete-athlete";
export { getFirebaseStorage } from "./storage/client";
export {
  AVATAR_MAX_BYTES,
  athleteAvatarPath,
  avatarFileProblem,
  deleteAthleteAvatar,
  uploadAthleteAvatar,
} from "./storage/avatar";
export {
  athleteIdFromProfilePath,
  listAthleteProfiles,
  subscribeToAthleteProfiles,
  type AthleteRosterEntry,
} from "./firestore/athlete-roster";
export { ensurePointsOpeningBalance, probeLedgerEmpty, recordPointsChange } from "./firestore/points-ledger";
export {
  pointsLedgerRowFromDocument,
  readPointsLedgerMonth,
  readPointsLedgerOpening,
  readPointsLedgerTotal,
  type PointsLedgerRow,
} from "./firestore/points-ledger-read";
export {
  deleteTaskHistoryDay,
  subscribeToTaskHistoryMonth,
  type ArchivedTask,
  type ArchivedTaskDay,
} from "./firestore/task-history";
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
  generatePlanTasksIfNeeded,
  setPlanFocus,
  type GeneratePlanTasksResult,
} from "./firestore/training-plan";
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
  requestPasswordResetEmail,
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
