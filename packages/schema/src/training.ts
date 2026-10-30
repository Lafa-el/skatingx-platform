import type { DateString, Timestamp } from "./common";

export type TrainingTaskSource = "manual" | "academy" | "system" | "plan";

/** Same three values as the plan template focuses; the schema package cannot import the domain one. */
export type TrainingPlanFocus = "lean" | "bounce" | "endurance";

export interface TrainingTask {
  id: string;
  text: string;
  target?: string;
  description?: string;
  source?: TrainingTaskSource;
  completed: boolean;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  /** Stable id from `@skatingx/content` academy catalog */
  academyItemId?: string;
  /** Stable, language-independent id of the plan template entry (`jd_tech_mon.1`) this task came from. */
  planEntryId?: string;
  tags?: string[];
  /** @deprecated Use description */
  desc?: string;
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
 * Training state (`athletes/{athleteId}/training/state` — blueprint `training/state/main`).
 */
export interface TrainingState {
  todayTasks: TrainingTask[];
  weeklyTemplate: WeeklyTemplateByDay;
  lastLoginDate: DateString;
  pointsPerTask: number;
  dailyBonusPoints: number;
  /** ADR-008: the week focus chosen on the plan page or accepted from an analysis suggestion. */
  planFocus?: TrainingPlanFocus;
  /** Monday (local date) of the week `planFocus` was chosen. The focus only generates tasks in that week. */
  planFocusWeek?: DateString;
  /** Last local date plan tasks were generated. The idempotency marker: a deleted task is not re-created. */
  planGeneratedDate?: DateString;
  updatedAt?: Timestamp;
}

/** Archived day (`athletes/{athleteId}/training/main/taskHistory/{dateId}`). */
export interface TaskHistoryDay {
  dateId: DateString;
  tasks: TrainingTask[];
  archivedAt?: Timestamp;
}

/** @deprecated Use `DistanceRecordsDocument` + `TimeEntry` from `./records`. */
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

/** @deprecated Use `RewardItem` from `./rewards`. */
export interface Reward {
  id: string;
  name: string;
  cost: number;
  icon: string;
}

/** @deprecated Legacy numeric day keys */
export type WeeklyTemplate = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, string>>;
