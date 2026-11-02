import { describe, expect, it } from "vitest";

import { buildBiomechAnalysisRecord } from "./biomech-record";
import type { PoseKeyframeSample } from "./biomech-session";

function sample(overrides: Partial<PoseKeyframeSample>): PoseKeyframeSample {
  return {
    timeSeconds: 1,
    readable: true,
    unreadableReason: null,
    kneeAngle: 90,
    leanAngle: 40,
    pelvisHeight: 50,
    recoveryRate: 0,
    supportSide: "left",
    supportConfidence: 80,
    manual: false,
    issue: null,
    ...overrides,
  };
}

function recordOf(overrides: Partial<PoseKeyframeSample>) {
  return buildBiomechAnalysisRecord({
    id: "biomech-abc",
    ownerUserId: "user-1",
    createdAt: "2026-10-19T07:00:00.000Z",
    samples: [sample(overrides)],
  });
}

function codes(overrides: Partial<PoseKeyframeSample>) {
  return recordOf(overrides).findings.map((finding) => finding.code);
}

describe("buildBiomechAnalysisRecord pelvis.high", () => {
  it("emits pelvis.high for a low y-percent sample", () => {
    expect(codes({ pelvisHeight: 30 })).toContain("biomech.pelvis.high");
  });

  it("does not emit pelvis.high for a crouched high y-percent sample", () => {
    expect(codes({ pelvisHeight: 70 })).not.toContain("biomech.pelvis.high");
  });

  it("leaves knee and lean findings unchanged when the pelvis gate flips", () => {
    const highKneeLean = { kneeAngle: 120, leanAngle: 60 };
    expect(codes({ ...highKneeLean, pelvisHeight: 30 })).toEqual([
      "biomech.knee.high",
      "biomech.lean.high",
      "biomech.pelvis.high",
    ]);
    expect(codes({ ...highKneeLean, pelvisHeight: 70 })).toEqual(["biomech.knee.high", "biomech.lean.high"]);
  });
});
