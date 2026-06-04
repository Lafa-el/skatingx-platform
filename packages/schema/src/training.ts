import type { DateString, Timestamp } from "./common";

export interface TrainingTask {
  id: string | number;
  text: string;
  target?: string;
  desc?: string;
  completed: boolean;
  isTemplate?: boolean;
}

export interface WeeklyTemplateByDay {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
}

/**
 * Training state (`athletes/{athleteId}/trainingState/main`).
 */
export interface TrainingState {
  todayTasks: TrainingTask[];
  weeklyTemplate: WeeklyTemplateByDay;
  lastLoginDate: DateString;
  updatedAt?: Timestamp;
}

export interface TrainingRecord {
  date: DateString;
  timeSeconds: number;
  distanceId: string;
  notes?: string;
}

export interface Race {
  id: string;
  name: string;
  date: DateString;
}

export interface Reward {
  id: string;
  name: string;
  cost: number;
  icon: string;
}

/** @deprecated Legacy numeric day keys */
export type WeeklyTemplate = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, string>>;
