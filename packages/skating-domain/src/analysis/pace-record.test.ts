import { describe, expect, it } from "vitest";

import { baselinePoseParameters } from "../../../../docs/migration/analysis/contract-types";
import { calculatePacingAnalysis, pacingDistanceConfigs } from "./legacy-pace";
import { buildPaceAnalysisRecord, paceProvenanceModel } from "./pace-record";

describe("pace analysis record", () => {
  it("keeps the contract pose parameter block, even though this run does not start Pose", () => {
    expect(paceProvenanceModel).toEqual(baselinePoseParameters);
  });

  it("builds a user-level pace record for lindsay with an ISO createdAt", () => {
    const distance = "500" as const;
    const splits = [7.2, 9.3, 9.5, 10.4, 11.2];
    const benchmark = pacingDistanceConfigs[distance].defaults;
    const result = calculatePacingAnalysis(distance, splits, benchmark);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const record = buildPaceAnalysisRecord({
      id: "pace-500-abc",
      ownerUserId: "alice",
      createdAt: "2026-10-19T04:59:13.497Z",
      distance,
      splits,
      benchmark,
      analysis: result.analysis,
    });

    expect(record.athleteId).toBe("lindsay");
    expect(record.provenance.schemaVersion).toBe("skatingx-analysis-contract-v1");
    expect(record.provenance.algorithmVersion).toBe("legacy-pace-port-1");
    expect(record.pace.rating).toBe("needs-work");
    expect(record.pace.stabilityIndexPercent).toBe(47);
    expect(record.pace.decayPercent).toBe(result.analysis.decayPercent);
    expect(record.pace.trainingEmphasisRatio).toBe("45:55");
    expect(Object.keys(record).sort()).toEqual(
      ["athleteId", "createdAt", "findings", "id", "ownerUserId", "pace", "provenance"],
    );
    expect(record).not.toHaveProperty("paceInput");
    expect(record).not.toHaveProperty("video");
    expect(JSON.stringify(record)).not.toMatch(/storage|gs:\/\//);
  });
});
