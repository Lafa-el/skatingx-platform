import { describe, expect, it } from "vitest";

import { baselinePoseParameters } from "../../../../docs/migration/analysis/contract-types";
import { calculatePacingAnalysis, pacingDistanceConfigs, type PaceAnalysis } from "./legacy-pace";
import { buildPaceAnalysisRecord, paceProvenanceModel } from "./pace-record";

function analysis(overrides: Partial<PaceAnalysis>): PaceAnalysis {
  return {
    ratingLabel: "优秀",
    levelSub: "后半程节奏接近标杆",
    trainingRatio: "60:40",
    lacticIndexPercent: 100,
    totalSeconds: 50,
    benchmarkTotalSeconds: 50,
    decayPercent: 8,
    benchmarkDecayPercent: 5,
    earlyAverageSeconds: 10,
    lateAverageSeconds: 10,
    maxSegmentJump: 0,
    benchmarkMaxJump: 0,
    finishGapSeconds: 0,
    ...overrides,
  };
}

function recordFor(next: PaceAnalysis) {
  return buildPaceAnalysisRecord({
    id: "pace-500-abc",
    ownerUserId: "alice",
    createdAt: "2026-10-19T04:59:13.497Z",
    distance: "500",
    splits: [1, 1, 1, 1, 1],
    benchmark: [1, 1, 1, 1, 1],
    analysis: next,
  });
}

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
      ["athleteId", "createdAt", "distance", "findings", "id", "ownerUserId", "pace", "provenance"],
    );
    expect(record.distance).toBe("500");
    expect(record.pace.splits).toEqual(splits);
    expect(record.pace.benchmark).toEqual([...benchmark]);
    expect(record).not.toHaveProperty("paceInput");
    expect(record).not.toHaveProperty("video");
    expect(JSON.stringify(record)).not.toMatch(/storage|gs:\/\//);
  });

  it("writes a decay finding only past the excellent boundary and a total finding only when slower", () => {
    const cases = [
      {
        name: "decay over and slower",
        analysis: analysis({ decayPercent: 8.01, totalSeconds: 50.01 }),
        codes: ["pace.decay.back-half", "pace.total.versus-benchmark"],
      },
      {
        name: "decay over and not slower",
        analysis: analysis({ decayPercent: 8.01, totalSeconds: 50 }),
        codes: ["pace.decay.back-half"],
      },
      {
        name: "decay at the boundary and slower",
        analysis: analysis({ decayPercent: 8, totalSeconds: 50.01 }),
        codes: ["pace.total.versus-benchmark"],
      },
      {
        name: "neither",
        analysis: analysis({ decayPercent: 8, totalSeconds: 50 }),
        codes: [],
      },
    ] as const;

    for (const item of cases) {
      const record = recordFor(item.analysis);
      const codes = item.codes.map((code) => ({ code, analysisId: "pace-500-abc" }));
      expect(record.findings, item.name).toEqual(codes);
      expect(record.pace.findings, item.name).toBe(record.findings);
    }
  });

  it("stores copies of the splits and the benchmark, not the caller's arrays", () => {
    const splits = [7.2, 9.3, 9.5, 10.4, 11.2];
    const benchmark = [8, 10.3, 10.4, 10.5, 10.8];
    const record = buildPaceAnalysisRecord({
      id: "pace-500-abc",
      ownerUserId: "alice",
      createdAt: "2026-10-19T04:59:13.497Z",
      distance: "500",
      splits,
      benchmark,
      analysis: analysis({}),
    });
    expect(record.pace.splits).not.toBe(splits);
    expect(record.pace.benchmark).not.toBe(benchmark);
    splits[0] = 99;
    benchmark[0] = 99;
    expect(record.pace.splits[0]).toBe(7.2);
    expect(record.pace.benchmark[0]).toBe(8);
  });

  it.each([
    ["500", 5],
    ["777", 7],
    ["1000", 9],
  ] as const)("accepts exactly the %sm segment count (%i), taken from the distance table", (distance, count) => {
    expect(pacingDistanceConfigs[distance].labels).toHaveLength(count);
    const series = Array.from({ length: count }, () => 10);
    const record = buildPaceAnalysisRecord({
      id: `pace-${distance}-abc`,
      ownerUserId: "alice",
      createdAt: "2026-10-19T04:59:13.497Z",
      distance,
      splits: series,
      benchmark: series,
      analysis: analysis({}),
    });
    expect(record.distance).toBe(distance);
    expect(record.pace.splits).toHaveLength(count);
  });

  describe("refuses a record whose inputs do not describe one run", () => {
    const good = {
      id: "pace-500-abc",
      ownerUserId: "alice",
      createdAt: "2026-10-19T04:59:13.497Z",
      distance: "500" as const,
      splits: [1, 1, 1, 1, 1],
      benchmark: [1, 1, 1, 1, 1],
      analysis: analysis({}),
    };
    const build = (overrides: Record<string, unknown>) =>
      buildPaceAnalysisRecord({ ...good, ...overrides } as Parameters<typeof buildPaceAnalysisRecord>[0]);

    it("a distance that is not one of the three", () => {
      expect(() => build({ distance: "800" })).toThrow(/distance/);
      expect(() => build({ distance: "constructor" })).toThrow(/distance/);
    });

    it("splits and benchmark of different lengths", () => {
      expect(() => build({ benchmark: [1, 1, 1, 1] })).toThrow(/benchmark/);
      expect(() => build({ splits: [1, 1, 1, 1, 1, 1] })).toThrow(/splits/);
    });

    it("a length that does not match the distance", () => {
      expect(() => build({ distance: "777" })).toThrow(/7 entries for 777m/);
      expect(() => build({ distance: "1000", splits: Array(7).fill(1), benchmark: Array(7).fill(1) })).toThrow(
        /9 entries for 1000m/,
      );
    });

    it("an entry that is not a finite number", () => {
      expect(() => build({ splits: [1, 1, Number.NaN, 1, 1] })).toThrow(/finite/);
      expect(() => build({ benchmark: [1, 1, 1, Number.POSITIVE_INFINITY, 1] })).toThrow(/finite/);
      expect(() => build({ splits: [1, "1", 1, 1, 1] })).toThrow(/finite/);
    });
  });
});
