import { DEFAULT_ATHLETE_ID } from "@skatingx/schema";

import {
  PACE_ALGORITHM_VERSION,
  type PaceAnalysis,
  type PaceDistance,
} from "./legacy-pace";

/**
 * Same parameter block as `baselinePoseParameters` in
 * `docs/migration/analysis/contract-types.ts`. A pace record carries it because
 * `AnalysisProvenance` requires `model` on every saved analysis, including a run
 * that never starts Pose. A test locks the two copies together.
 */
export const paceProvenanceModel = {
  modelVersion: "mediapipe-pose@0.5.1675469404",
  modelVariant: "pose_landmark_full",
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
  poseFrameIntervalMs: 180,
  maxAnalysisEdgePx: 640,
} as const;

const ratingByLabel = {
  优秀: "excellent",
  需强化: "needs-work",
  稳定中等: "moderate",
} as const;

const analysisIdPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface PaceAnalysisRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly athleteId: typeof DEFAULT_ATHLETE_ID;
  /** ISO-8601 string. Not a Firestore Timestamp. */
  readonly createdAt: string;
  readonly provenance: {
    readonly schemaVersion: "skatingx-analysis-contract-v1";
    readonly algorithmVersion: typeof PACE_ALGORITHM_VERSION;
    readonly model: typeof paceProvenanceModel;
  };
  readonly pace: {
    readonly provenance: PaceAnalysisRecord["provenance"];
    readonly totalSeconds: number;
    readonly benchmarkTotalSeconds: number;
    readonly stabilityIndexPercent: number;
    /** The decay already computed for this run. Older saved records omit it. */
    readonly decayPercent: number;
    readonly rating: "excellent" | "needs-work" | "moderate";
    readonly trainingEmphasisRatio: PaceAnalysis["trainingRatio"];
    readonly findings: readonly { readonly code: string; readonly analysisId: string }[];
  };
  readonly findings: readonly { readonly code: "pace.decay.back-half" | "pace.total.versus-benchmark"; readonly analysisId: string }[];
}

export function buildPaceAnalysisRecord(input: {
  id: string;
  ownerUserId: string;
  createdAt: string;
  distance: PaceDistance;
  splits: readonly number[];
  benchmark: readonly number[];
  analysis: PaceAnalysis;
}): PaceAnalysisRecord {
  if (!analysisIdPattern.test(input.id) || input.id.length > 64) {
    throw new Error("Pace analysis id is not a valid Firestore id.");
  }
  if (Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error("Pace analysis createdAt must be an ISO-8601 string.");
  }

  const provenance = {
    schemaVersion: "skatingx-analysis-contract-v1" as const,
    algorithmVersion: PACE_ALGORITHM_VERSION,
    model: paceProvenanceModel,
  };
  const findings = [
    { code: "pace.decay.back-half" as const, analysisId: input.id },
    { code: "pace.total.versus-benchmark" as const, analysisId: input.id },
  ];

  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    athleteId: DEFAULT_ATHLETE_ID,
    createdAt: input.createdAt,
    provenance,
    findings,
    pace: {
      provenance,
      totalSeconds: input.analysis.totalSeconds,
      benchmarkTotalSeconds: input.analysis.benchmarkTotalSeconds,
      stabilityIndexPercent: input.analysis.lacticIndexPercent,
      decayPercent: input.analysis.decayPercent,
      rating: ratingByLabel[input.analysis.ratingLabel],
      trainingEmphasisRatio: input.analysis.trainingRatio,
      findings,
    },
  };
}
