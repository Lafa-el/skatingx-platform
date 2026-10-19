export { compareDateStrings, previousDateString, todayDateString } from "./dates";
export { calculateStreakDays } from "./streak";
export {
  allTasksCompleted,
  applyTaskToggle,
  createTaskId,
  normalizeTask,
  normalizeTrainingState,
  type TaskToggleResult,
} from "./tasks";
export {
  formatRedemptionStatus,
  getActiveRewards,
  localizeRewardDescription,
  localizeRedemptionName,
  localizeRewardName,
  sortRedemptionsNewest,
} from "./rewards";
export {
  buildAcademyImportCandidate,
  buildTaskFromAcademyCandidate,
  filterNewAcademyCandidates,
  hasAcademyItemImportedToday,
  matchRoutineTaskLabel,
  type AcademyImportCandidate,
} from "./academy";
export {
  buildRaceSummary,
  countByVerification,
  createPendingProvenance,
  createRaceResultId,
  groupRaceEntriesByDay,
  isConfirmed,
  isValidRaceDayId,
  markPending,
  markVerified,
  RACE_SUMMARY_VERSION,
  sortRaceEntries,
  validateRaceResultInput,
  type RaceDayGroup,
  type RaceResultErrorCode,
  type RaceResultInput,
  type RaceSummary,
  type RaceSummaryInput,
  type RaceSummaryItem,
} from "./race-day";
export {
  BUFFALO_2026_TEMPLATE,
  RACE_DAY_TEMPLATES,
  type RaceDayTemplate,
} from "./race-day-templates";
export {
  buildTodayView,
  eventPhase,
  RACE_DAY_TODAY_VERSION,
  type EventPhase,
  type NextRace,
  type TodayInput,
  type TodayRace,
  type TodayView,
} from "./race-day-today";
export { instantToZonedDateTime, zonedDateTimeToInstant } from "./race-day-time";
export {
  createIdSuffix,
  checkExternalUrl,
  createRaceDayEntityId,
  externalUrlHost,
  formatResultTime,
  isRealDateString,
  parseResultTime,
  prepareRaceEventInput,
  prepareRaceInput,
  prepareRaceResultInput,
  prepareRaceSummaryNoteInput,
  prepareRaceVideoInput,
  prepareRosterEntryInput,
  RACE_DAY_LIMITS,
  RACE_RESULT_PLACE_MAX,
  RESULT_TIME_MAX_DECIMALS,
  type PreparedInput,
  type RaceDayInputError,
  type RaceDayInputErrorCode,
  type RaceEventInput,
  type ExternalUrlCheck,
  type ParsedResultTime,
  type RaceInput,
  type RaceResultFormInput,
  type RaceResultWriteInput,
  type RaceSummaryNoteInput,
  type RaceVideoInput,
  type RosterEntryInput,
} from "./race-day-input";
export {
  createTimeEntryId,
  formatSecondsToTime,
  getBestTime,
  getLatestTime,
  normalizeDistanceId,
  normalizeDistanceRecordsDocument,
  normalizeTimeEntry,
  parseTimeToSeconds,
  sortRecordsByDate,
} from "./records";
export {
  assessVideoInput,
  calculateAngle,
  classifyPoseIssue,
  interpretPoseFrame,
  LEGACY_POSE_LIMITS,
  resetAnalysisSession,
  shouldSendPoseFrame,
} from "./analysis/legacy-pose";
export {
  calculatePacingAnalysis,
  PACE_ALGORITHM_VERSION,
  pacingDistanceConfigs,
} from "./analysis/legacy-pace";
export type { PaceAnalysis, PaceDistance, PaceResult } from "./analysis/legacy-pace";
export {
  buildPaceAnalysisRecord,
  paceProvenanceModel,
  type PaceAnalysisRecord,
} from "./analysis/pace-record";
export { buildEquipmentChecklist, buildEquipmentRuleHints, parseGaugeNumber } from "./analysis/legacy-equipment";
