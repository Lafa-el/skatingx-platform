export type AcademyItemCategory =
  | "dryland"
  | "ice"
  | "strength"
  | "mobility"
  | "technique"
  | "recovery";

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface AcademyItem {
  id: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  category: AcademyItemCategory;
  targetZh: string;
  targetEn: string;
  tags: string[];
  suggestedDurationMinutes?: number;
  difficultyLevel?: number;
}

export interface AcademyModule {
  id: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  items: AcademyItem[];
}

export interface AcademyRoutineItem {
  routineItemId: string;
  taskLabel: string;
}

export interface AcademyDayPlan {
  id: string;
  dayLabelZh: string;
  dayLabelEn: string;
  titleZh: string;
  titleEn: string;
  durationZh: string;
  durationEn: string;
  weekday: WeekdayKey;
  taskLabels: string[];
}

export interface WeeklyRoutine {
  id: string;
  stageId: string;
  titleZh: string;
  titleEn: string;
  days: Record<WeekdayKey, AcademyRoutineItem[]>;
  dayPlans: AcademyDayPlan[];
}

export interface AcademyStage {
  id: string;
  labelZh: string;
  labelEn: string;
  ageRange: string;
  overviewZh: string;
  overviewEn: string;
  durationZh: string;
  durationEn: string;
  frequencyZh: string;
  frequencyEn: string;
  coreFocusZh: string;
  coreFocusEn: string;
  modules: AcademyModule[];
  weeklyRoutine: WeeklyRoutine;
}

export type AcademyLanguage = "zh" | "en";
