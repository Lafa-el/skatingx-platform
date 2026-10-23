export { DEFAULT_ATHLETE_ID, PLATFORM_APP_ID } from "./constants";
export type { Language } from "./language";

export type { DateString, LegacySource, Timestamp } from "./common";

export type { User, UserSettings } from "./user";

export type { Athlete, AthleteId, AthleteProfile } from "./athlete";

export type { Gamification } from "./gamification";

export {
  POINTS_LEDGER_OPENING_ID,
  POINTS_LEDGER_REASONS,
  type PointsLedgerEvent,
  type PointsLedgerReason,
} from "./points-ledger";

export type {
  AnalysisModule,
  AnalysisSession,
  AnalysisSessionSource,
  AnalysisSessionStatus,
  AnalysisTag,
  AnalysisTagSeverity,
} from "./analysis";

export type {
  BladeBend,
  BladeOffsets,
  EquipmentRecord,
  RockerReadings,
} from "./equipment";

export type {
  Race,
  Reward,
  TaskHistoryDay,
  TrainingRecord,
  TrainingState,
  TrainingTask,
  TrainingTaskSource,
  WeeklyTemplate,
  WeeklyTemplateByDay,
} from "./training";

export type {
  DefaultDistanceDefinition,
  DistanceRecordsDocument,
  TimeEntry,
  TimeEntrySource,
} from "./records";

export { DEFAULT_TRAINING_DISTANCES } from "./records";

export type {
  RedemptionStatus,
  RewardItem,
  RewardRedemption,
  RewardsCatalogDocument,
} from "./rewards";

export {
  createDefaultRewardsCatalog,
  DEFAULT_REWARD_ITEMS,
} from "./defaults-rewards";

export {
  DEFAULT_DAILY_BONUS_POINTS,
  DEFAULT_POINTS_PER_TASK,
} from "./defaults";

export {
  createDefaultAthleteProfile,
  createDefaultGamification,
  createDefaultTrainingState,
  createDefaultUserSettings,
  EMPTY_WEEKLY_TEMPLATE,
  todayDateString,
} from "./defaults";

export type {
  RaceDayAudit,
  RaceDayDataSource,
  RaceDayProvenance,
  RaceDayVerification,
  RaceEntry,
  RaceEvent,
  RaceResult,
  RaceResultStatus,
  RaceRosterEntry,
  RaceSummaryDoc,
  RaceVideoRef,
} from "./race-day";

export { RACE_DAY_SCHEMA_VERSION } from "./race-day";

export { pathToSegments, paths } from "./paths";
