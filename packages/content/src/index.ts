export const CONTENT_VERSION = "1.0.0-academy" as const;

export {
  ACADEMY_CONTENT_VERSION,
  ACADEMY_STAGES,
  findAcademyItem,
  flattenStageItems,
  getAcademyStage,
  getAcademyStages,
  getWeekdayRoutineItems,
  localizeAcademyItem,
  localizeStageLabel,
} from "./academy";

export type {
  AcademyDayPlan,
  AcademyItem,
  AcademyItemCategory,
  AcademyLanguage,
  AcademyModule,
  AcademyRoutineItem,
  AcademyStage,
  WeekdayKey,
  WeeklyRoutine,
} from "./academy-types";
