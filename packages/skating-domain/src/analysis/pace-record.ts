import { DEFAULT_ATHLETE_ID } from "@skatingx/schema";

import {
  PACE_ALGORITHM_VERSION,
  pacingDistanceConfigs,
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
  /**
   * Which race distance this run is for. Records saved before this field existed omit it; readers
   * treat that as an unknown distance.
   */
  readonly distance: PaceDistance;
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
    /** The segment times and the benchmark the run was analysed with, one entry per segment. */
    readonly splits: readonly number[];
    readonly benchmark: readonly number[];
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

  if (!Object.hasOwn(pacingDistanceConfigs, input.distance)) {
    throw new Error("Pace analysis distance must be 500, 777 or 1000.");
  }
  const segmentCount = pacingDistanceConfigs[input.distance].labels.length;
  for (const [name, values] of [
    ["splits", input.splits],
    ["benchmark", input.benchmark],
  ] as const) {
    if (values.length !== segmentCount) {
      throw new Error(`Pace analysis ${name} must have ${segmentCount} entries for ${input.distance}m.`);
    }
    if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`Pace analysis ${name} must be finite numbers.`);
    }
  }

  const provenance = {
    schemaVersion: "skatingx-analysis-contract-v1" as const,
    algorithmVersion: PACE_ALGORITHM_VERSION,
    model: paceProvenanceModel,
  };
  // +3 is the boundary legacy-pace already uses before a run leaves 优秀.
  const findings: PaceAnalysisRecord["findings"][number][] = [];
  if (input.analysis.decayPercent > input.analysis.benchmarkDecayPercent + 3) {
    findings.push({ code: "pace.decay.back-half", analysisId: input.id });
  }
  if (input.analysis.totalSeconds > input.analysis.benchmarkTotalSeconds) {
    findings.push({ code: "pace.total.versus-benchmark", analysisId: input.id });
  }

  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    athleteId: DEFAULT_ATHLETE_ID,
    createdAt: input.createdAt,
    distance: input.distance,
    provenance,
    findings,
    pace: {
      provenance,
      totalSeconds: input.analysis.totalSeconds,
      benchmarkTotalSeconds: input.analysis.benchmarkTotalSeconds,
      stabilityIndexPercent: input.analysis.lacticIndexPercent,
      // Copies, not the caller's arrays: the page keeps editing its own state.
      splits: [...input.splits],
      benchmark: [...input.benchmark],
      decayPercent: input.analysis.decayPercent,
      rating: ratingByLabel[input.analysis.ratingLabel],
      trainingEmphasisRatio: input.analysis.trainingRatio,
      findings,
    },
  };
}
