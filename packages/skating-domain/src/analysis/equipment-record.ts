import { DEFAULT_ATHLETE_ID } from "@skatingx/schema";

import { paceProvenanceModel } from "./pace-record";

export const EQUIPMENT_ALGORITHM_VERSION = "legacy-equipment-port-1" as const;

const recordIdPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const equipmentSymptomKeys = [
  "slide",
  "boot-out",
  "unstable",
  "ankle",
  "release",
  "asymmetry",
] as const;

export type EquipmentSymptomKey = (typeof equipmentSymptomKeys)[number];

export const equipmentAdjustmentCodes = [
  "unchanged",
  "radius-rocker",
  "offset",
  "bend",
  "blade-change",
  "boot-change",
  "combined",
] as const;

export type EquipmentAdjustmentCode = (typeof equipmentAdjustmentCodes)[number];

export const equipmentFeedbackCodes = [
  "not-skated",
  "clear-improvement",
  "slight-improvement",
  "no-change",
  "worse-revert",
] as const;

export type EquipmentFeedbackCode = (typeof equipmentFeedbackCodes)[number];

export interface EquipmentGaugePoint {
  readonly point: number;
  readonly value: string;
}

export interface EquipmentHistoryRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly athleteId: typeof DEFAULT_ATHLETE_ID;
  /** ISO-8601 string. Not a Firestore Timestamp. */
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly provenance: {
    readonly schemaVersion: "skatingx-analysis-contract-v1";
    readonly algorithmVersion: typeof EQUIPMENT_ALGORITHM_VERSION;
    readonly model: typeof paceProvenanceModel;
  };
  readonly symptomKey: EquipmentSymptomKey;
  readonly symptomText: string;
  readonly height: string;
  /** Display text. The page collapses float32 noise, such as 7.050000190734863, before save. */
  readonly weight: string;
  readonly bladeLength: string;
  readonly leftRocker: readonly EquipmentGaugePoint[];
  readonly rightRocker: readonly EquipmentGaugePoint[];
  readonly offsets: {
    readonly leftFront: string;
    readonly leftRear: string;
    readonly rightFront: string;
    readonly rightRear: string;
  };
  readonly bend: {
    readonly front: string;
    readonly middle: string;
    readonly rear: string;
  };
  readonly adjustmentType: EquipmentAdjustmentCode;
  readonly feedbackRating: EquipmentFeedbackCode;
  readonly adjustmentNotes: string;
  readonly missingCore: boolean;
  readonly ruleHints: readonly string[];
}

const findingCode = {
  slide: "equipment.symptom.slide",
  "boot-out": "equipment.symptom.boot-out",
  unstable: "equipment.symptom.unstable",
  ankle: "equipment.symptom.ankle",
  release: "equipment.symptom.release",
  asymmetry: "equipment.symptom.asymmetry",
} as const;

export function buildEquipmentHistoryRecord(input: {
  id: string;
  ownerUserId: string;
  createdAt: string;
  symptomKey: EquipmentSymptomKey;
  symptomText: string;
  height: string;
  weight: string;
  bladeLength: string;
  leftRocker: readonly EquipmentGaugePoint[];
  rightRocker: readonly EquipmentGaugePoint[];
  offsets: EquipmentHistoryRecord["offsets"];
  bend: EquipmentHistoryRecord["bend"];
  adjustmentType: EquipmentAdjustmentCode;
  feedbackRating: EquipmentFeedbackCode;
  adjustmentNotes: string;
  missingCore: boolean;
  ruleHints: readonly string[];
}): EquipmentHistoryRecord & {
  readonly findings: readonly { readonly code: string; readonly analysisId: string }[];
} {
  if (!recordIdPattern.test(input.id) || input.id.length > 64) {
    throw new Error("Equipment record id is not a valid Firestore id.");
  }
  if (Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error("Equipment record createdAt must be an ISO-8601 string.");
  }

  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    athleteId: DEFAULT_ATHLETE_ID,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    provenance: {
      schemaVersion: "skatingx-analysis-contract-v1",
      algorithmVersion: EQUIPMENT_ALGORITHM_VERSION,
      model: paceProvenanceModel,
    },
    symptomKey: input.symptomKey,
    symptomText: input.symptomText,
    height: input.height,
    weight: input.weight,
    bladeLength: input.bladeLength,
    leftRocker: input.leftRocker,
    rightRocker: input.rightRocker,
    offsets: input.offsets,
    bend: input.bend,
    adjustmentType: input.adjustmentType,
    feedbackRating: input.feedbackRating,
    adjustmentNotes: input.adjustmentNotes,
    missingCore: input.missingCore,
    ruleHints: input.ruleHints,
    findings: [{ code: findingCode[input.symptomKey], analysisId: input.id }],
  };
}
