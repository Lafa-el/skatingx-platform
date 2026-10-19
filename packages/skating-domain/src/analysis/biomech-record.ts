import { DEFAULT_ATHLETE_ID } from "@skatingx/schema";

import { aggregateKeyframes, type PoseKeyframeSample } from "./biomech-session";
import { paceProvenanceModel } from "./pace-record";

export const BIOMECH_ALGORITHM_VERSION = "legacy-biomech-port-1" as const;

const analysisIdPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface BiomechPoseFrame {
  readonly timeSeconds: number;
  readonly readable: boolean;
  readonly unreadableReason?: PoseKeyframeSample["unreadableReason"];
  readonly kneeAngleDegrees?: number;
  readonly leanAngleDegrees?: number;
  readonly pelvisHeightRatio?: number;
  readonly recoveryRate?: number;
  readonly supportLeg?: {
    readonly side: "left" | "right" | "unknown";
    readonly confidencePercent: number;
    readonly manual: boolean;
  };
}

export interface BiomechAnalysisRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly athleteId: typeof DEFAULT_ATHLETE_ID;
  readonly createdAt: string;
  readonly provenance: {
    readonly schemaVersion: "skatingx-analysis-contract-v1";
    readonly algorithmVersion: typeof BIOMECH_ALGORITHM_VERSION;
    readonly model: typeof paceProvenanceModel;
  };
  readonly poseFrames: readonly BiomechPoseFrame[];
  readonly findings: readonly {
    readonly code: "biomech.knee.high" | "biomech.lean.high" | "biomech.pelvis.high" | "biomech.frame.unreadable";
    readonly analysisId: string;
  }[];
}

function frameOf(sample: PoseKeyframeSample): BiomechPoseFrame {
  return {
    timeSeconds: sample.timeSeconds,
    readable: sample.readable,
    ...(sample.unreadableReason ? { unreadableReason: sample.unreadableReason } : {}),
    ...(sample.kneeAngle !== null ? { kneeAngleDegrees: sample.kneeAngle } : {}),
    ...(sample.leanAngle !== null ? { leanAngleDegrees: sample.leanAngle } : {}),
    ...(sample.pelvisHeight !== null ? { pelvisHeightRatio: sample.pelvisHeight } : {}),
    ...(sample.recoveryRate !== null ? { recoveryRate: sample.recoveryRate } : {}),
    ...(sample.supportConfidence !== null
      ? {
          supportLeg: {
            side: sample.supportSide,
            confidencePercent: sample.supportConfidence,
            manual: sample.manual,
          },
        }
      : {}),
  };
}

export function buildBiomechAnalysisRecord(input: {
  id: string;
  ownerUserId: string;
  createdAt: string;
  samples: readonly PoseKeyframeSample[];
}): BiomechAnalysisRecord {
  if (!analysisIdPattern.test(input.id) || input.id.length > 64) {
    throw new Error("Biomechanics analysis id is not a valid Firestore id.");
  }
  if (Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error("Biomechanics analysis createdAt must be an ISO-8601 string.");
  }
  if (input.samples.length > 10) {
    throw new Error("Biomechanics analysis keeps at most 10 sampled frames.");
  }

  const aggregate = aggregateKeyframes(input.samples);
  const findings: BiomechAnalysisRecord["findings"][number][] = [];
  if (aggregate.highKnee > 0) findings.push({ code: "biomech.knee.high", analysisId: input.id });
  if (aggregate.highLean > 0) findings.push({ code: "biomech.lean.high", analysisId: input.id });
  if (input.samples.some((sample) => sample.readable && (sample.pelvisHeight ?? 0) > 62)) {
    findings.push({ code: "biomech.pelvis.high", analysisId: input.id });
  }
  if (input.samples.some((sample) => !sample.readable)) {
    findings.push({ code: "biomech.frame.unreadable", analysisId: input.id });
  }

  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    athleteId: DEFAULT_ATHLETE_ID,
    createdAt: input.createdAt,
    provenance: {
      schemaVersion: "skatingx-analysis-contract-v1",
      algorithmVersion: BIOMECH_ALGORITHM_VERSION,
      model: paceProvenanceModel,
    },
    poseFrames: input.samples.map(frameOf),
    findings,
  };
}
