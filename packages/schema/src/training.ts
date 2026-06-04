import type { DateString, Timestamp } from "./common";

/**
 * Daily checklist item (`training/state/main.tasks` and task history snapshots).
 * Legacy Training used numeric `id`; new writes may use string ids after migration.
 */
export interface TrainingTask {
  id: string | number;
  text: string;
  target?: string;
  /** Academy import description */
  desc?: string;
  completed: boolean;
  isTemplate?: boolean;
}

/**
 * Personal-best time entry (`training/records/{distanceId}` entries).
 * Legacy stored `time` in seconds under field name `time`.
 */
export interface TrainingRecord {
  date: DateString;
  /** Elapsed time in seconds (legacy field name: `time`) */
  timeSeconds: number;
  /** Distance bucket key, e.g. 500m, 777m, or custom slug */
  distanceId: string;
  notes?: string;
}

/** Upcoming race target (`training/races/{raceId}` or embedded list). */
export interface Race {
  id: string;
  name: string;
  /** Calendar date for countdown UI */
  date: DateString;
}

/** Shop catalog item (`training/rewards/catalog` items). */
export interface Reward {
  id: string;
  name: string;
  cost: number;
  icon: string;
}

/** Day-of-week template labels (0 = Sunday … 6 = Saturday). */
export type WeeklyTemplate = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, string>>;

/**
 * Today's training state (`athletes/{athleteId}/training/state/main`).
 * Not requested as a top-level export name; tasks live here in Firestore.
 */
export interface TrainingState {
  lastLoginDate?: DateString;
  weeklyTemplate?: WeeklyTemplate;
  tasks: TrainingTask[];
  updatedAt?: Timestamp;
}
