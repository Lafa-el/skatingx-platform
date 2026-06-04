import type { AthleteId } from "./athlete";
import type { Timestamp } from "./common";

/** Rocker tick readings per skate side (legacy Lab form). */
export interface RockerReadings {
  left: number[];
  right: number[];
}

/** Blade offset quadrants (mm), legacy shape. */
export interface BladeOffsets {
  leftFront?: number;
  leftRear?: number;
  rightFront?: number;
  rightRear?: number;
}

/** Blade bend zones (legacy shape). */
export interface BladeBend {
  front?: number;
  middle?: number;
  rear?: number;
}

/**
 * Equipment fitting snapshot (`athletes/{athleteId}/equipment/records/{recordId}`).
 * Both `savedAt` and `createdAt` are required on write (fixes legacy sort bug).
 */
export interface EquipmentRecord {
  id: string;
  athleteId: AthleteId;
  discipline?: string;
  focus?: string;
  symptomKey?: string;
  symptomText?: string;
  height?: string | number;
  weight?: string | number;
  bladeLength?: string | number;
  leftRockerReadings?: number[];
  rightRockerReadings?: number[];
  rockerSummary?: string;
  offsetSummary?: string;
  bendSummary?: string;
  offsets?: BladeOffsets;
  bend?: BladeBend;
  ruleHints?: string[];
  adjustmentType?: string;
  feedbackRating?: number;
  adjustmentNotes?: string;
  missingCore?: boolean;
  savedAt: Timestamp;
  createdAt: Timestamp;
}
