import type { DateString, Timestamp } from "./common";

export type TimeEntrySource = "manual" | "race" | "training";

export interface TimeEntry {
  id: string;
  date: DateString;
  timeSeconds: number;
  note?: string;
  source?: TimeEntrySource;
  createdAt: string;
  updatedAt?: string;
}

/** One Firestore doc per distance: `training/main/records/{distanceId}`. */
export interface DistanceRecordsDocument {
  distanceId: string;
  label: string;
  unit: "seconds";
  entries: TimeEntry[];
  updatedAt?: Timestamp;
}

export type DefaultDistanceDefinition = {
  distanceId: string;
  label: string;
};

export const DEFAULT_TRAINING_DISTANCES: readonly DefaultDistanceDefinition[] = [
  { distanceId: "333m", label: "333m" },
  { distanceId: "500m", label: "500m" },
  { distanceId: "777m", label: "777m" },
  { distanceId: "1000m", label: "1000m" },
  { distanceId: "1500m", label: "1500m" },
  { distanceId: "start_half_lap", label: "Start Half Lap" },
  { distanceId: "start_lap", label: "Start Lap" },
  { distanceId: "fastest_lap", label: "Fastest Lap" },
] as const;
