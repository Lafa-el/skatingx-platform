/**
 * M2 contract types for the analysis port.
 * Definitions only. No functions, no Firestore, no UI.
 * Not imported by the app. Included from tsconfig.tests.json so `npm run typecheck` checks them.
 * English copy is intentionally absent. See docs/migration/analysis/copy-zh.md.
 */

export const analysisContractSchemaVersion = "skatingx-analysis-contract-v1" as const;

/** Baseline locked by the M1 inventory. A later model change is a different contract. */
export interface PoseModelParameters {
  readonly modelVersion: "mediapipe-pose@0.5.1675469404";
  readonly modelVariant: "pose_landmark_full";
  readonly modelComplexity: 1;
  readonly smoothLandmarks: true;
  readonly enableSegmentation: false;
  readonly minDetectionConfidence: 0.5;
  readonly minTrackingConfidence: 0.5;
  readonly poseFrameIntervalMs: 180;
  readonly maxAnalysisEdgePx: 640;
}

export const baselinePoseParameters = {
  modelVersion: "mediapipe-pose@0.5.1675469404",
  modelVariant: "pose_landmark_full",
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
  poseFrameIntervalMs: 180,
  maxAnalysisEdgePx: 640,
} as const satisfies PoseModelParameters;

/** Carried on every saved analysis output. */
export interface AnalysisProvenance {
  readonly schemaVersion: typeof analysisContractSchemaVersion;
  /** Port of the legacy page logic, not the MediaPipe package version. */
  readonly algorithmVersion: string;
  readonly model: PoseModelParameters;
}

/** MediaPipe Pose 0.5 landmark. Index is the BlazePose index 0–32. */
export interface PoseKeypoint {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly visibility?: number;
}

export type SupportLegSide = "left" | "right" | "unknown";

export interface SupportLegReading {
  readonly side: SupportLegSide;
  readonly confidencePercent: number;
  readonly manual: boolean;
}

export const frameUnreadableReasons = [
  "no-pose",
  "occlusion-or-jump",
  "support-leg-uncertain",
  "keypoint-missing",
  "send-failed",
] as const;

export type FrameUnreadableReason = (typeof frameUnreadableReasons)[number];

export interface PoseFrameOutput {
  readonly timeSeconds: number;
  readonly landmarks: readonly PoseKeypoint[] | null;
  readonly readable: boolean;
  readonly unreadableReason?: FrameUnreadableReason;
  readonly kneeAngleDegrees?: number;
  readonly leanAngleDegrees?: number;
  readonly pelvisHeightRatio?: number;
  readonly recoveryRate?: number;
  readonly supportLeg?: SupportLegReading;
}

/**
 * Codes the analysis may attach to a saved result.
 * Phase 1.5 may map a code to a training suggestion. This contract does not.
 */
export const analysisFindingCodes = [
  "pace.decay.back-half",
  "pace.total.versus-benchmark",
  "biomech.knee.high",
  "biomech.lean.high",
  "biomech.pelvis.high",
  "biomech.frame.unreadable",
  "equipment.symptom.slide",
  "equipment.symptom.boot-out",
  "equipment.symptom.unstable",
  "equipment.symptom.ankle",
  "equipment.symptom.release",
  "equipment.symptom.asymmetry",
] as const;

export type AnalysisFindingCode = (typeof analysisFindingCodes)[number];

export interface AnalysisFinding {
  readonly code: AnalysisFindingCode;
  readonly analysisId: string;
}

export const paceDistances = ["500", "777", "1000"] as const;
export type PaceDistance = (typeof paceDistances)[number];

export interface PaceSplitInput {
  readonly label: string;
  readonly seconds: number;
}

export interface PaceInput {
  readonly distance: PaceDistance;
  readonly splits: readonly PaceSplitInput[];
  readonly benchmarkSplits: readonly PaceSplitInput[];
}

export interface PaceOutput {
  readonly provenance: AnalysisProvenance;
  readonly totalSeconds: number;
  readonly benchmarkTotalSeconds: number;
  readonly stabilityIndexPercent: number;
  readonly rating: "excellent" | "needs-work" | "moderate";
  readonly trainingEmphasisRatio: string;
  readonly findings: readonly AnalysisFinding[];
}

export const equipmentSymptomCodes = [
  "slide",
  "boot-out",
  "unstable",
  "ankle",
  "release",
  "asymmetry",
] as const;

export type EquipmentSymptomCode = (typeof equipmentSymptomCodes)[number];

export const equipmentAdjustmentTypes = [
  "unchanged",
  "radius-rocker",
  "offset",
  "bend",
  "blade-change",
  "boot-change",
  "combined",
] as const;

export type EquipmentAdjustmentType = (typeof equipmentAdjustmentTypes)[number];

export const equipmentFeedbackRatings = [
  "not-skated",
  "clear-improvement",
  "slight-improvement",
  "no-change",
  "worse-revert",
] as const;

export type EquipmentFeedbackRating = (typeof equipmentFeedbackRatings)[number];

/** Gauge tick. Point runs from -10 to 10. Value is the dial reading, not millimetres. */
export interface RockerReading {
  readonly point: number;
  readonly value: number | null;
}

export interface EquipmentInput {
  readonly symptomText: string;
  readonly symptomCode?: EquipmentSymptomCode;
  readonly weightKg: number | null;
  readonly heightCm: number | null;
  readonly bladeLength: string;
  readonly leftRocker: readonly RockerReading[];
  readonly rightRocker: readonly RockerReading[];
  readonly offset: {
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
  readonly adjustmentType: EquipmentAdjustmentType;
  readonly feedbackRating: EquipmentFeedbackRating;
  readonly notes: string;
}

export interface EquipmentChecklistItem {
  readonly title: string;
  readonly value: string;
  readonly detail: string;
}

export interface EquipmentOutput {
  readonly provenance: AnalysisProvenance;
  readonly checklist: readonly EquipmentChecklistItem[];
  readonly findings: readonly AnalysisFinding[];
  readonly incomplete: boolean;
}

export const analysisFailureKinds = [
  "model-script-missing",
  "model-warmup-failed",
  "frame-skipped",
  "result-skipped",
  "frame-unreadable",
  "pace-input-invalid",
  "benchmark-input-invalid",
  "equipment-checklist-required",
  "equipment-save-failed",
  "equipment-delete-failed",
] as const;

export type AnalysisFailureKind = (typeof analysisFailureKinds)[number];

export type AnalysisFailure =
  | { readonly kind: "model-script-missing" }
  | { readonly kind: "model-warmup-failed" }
  | { readonly kind: "frame-skipped" }
  | { readonly kind: "result-skipped" }
  | { readonly kind: "frame-unreadable"; readonly reason: FrameUnreadableReason }
  | { readonly kind: "pace-input-invalid" }
  | { readonly kind: "benchmark-input-invalid" }
  | { readonly kind: "equipment-checklist-required" }
  | { readonly kind: "equipment-save-failed"; readonly savedLocally: boolean }
  | { readonly kind: "equipment-delete-failed" };

/** One saved biomechanics or pace run. Not an equipment history row and not a check-in. */
export interface AnalysisRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly athleteId: string;
  /** ISO-8601 string. Not a Firestore Timestamp. */
  readonly createdAt: string;
  readonly provenance: AnalysisProvenance;
  readonly poseFrames?: readonly PoseFrameOutput[];
  readonly pace?: PaceOutput;
  readonly findings: readonly AnalysisFinding[];
}
