export { DEFAULT_ATHLETE_ID, PLATFORM_APP_ID } from "./constants";
export type { Language } from "./language";

export type { DateString, LegacySource, Timestamp } from "./common";

export type { User, UserSettings } from "./user";

export type { Athlete, AthleteId, AthleteProfile } from "./athlete";

export type { Gamification } from "./gamification";

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
  TrainingRecord,
  TrainingState,
  TrainingTask,
  WeeklyTemplate,
  WeeklyTemplateByDay,
} from "./training";

export {
  createDefaultAthleteProfile,
  createDefaultGamification,
  createDefaultTrainingState,
  createDefaultUserSettings,
  EMPTY_WEEKLY_TEMPLATE,
  todayDateString,
} from "./defaults";

export { pathToSegments, paths } from "./paths";
