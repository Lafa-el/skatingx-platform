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
  // Matching against academy items uses the Chinese label, in both languages.
  taskLabelZh: string;
  taskLabelEn: string;
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
  // Same length and order: taskLabelsEn[i] is the English of taskLabelsZh[i].
  taskLabelsZh: string[];
  taskLabelsEn: string[];
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
  ageRangeZh: string;
  ageRangeEn: string;
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
