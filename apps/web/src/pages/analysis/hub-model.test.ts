import { trainingFeedbackKey } from "@skatingx/skating-domain";
import { describe, expect, it } from "vitest";

import {
  buildHubModel,
  HUB_RECENT_LIMIT,
  HUB_SPARK_LIMIT,
  numericSeries,
  type HubAnalysisInput,
  type HubEquipmentInput,
  type HubLane,
} from "./hub-model";

function analysis(overrides: Partial<HubAnalysisInput> & Pick<HubAnalysisInput, "kind" | "id" | "createdAt">): HubAnalysisInput {
  return {
    findings: [],
    avgKnee: null,
    avgLean: null,
    decayPercent: null,
    stabilityIndexPercent: null,
    rating: null,
    ...overrides,
  };
}

function equipment(overrides: Partial<HubEquipmentInput> & Pick<HubEquipmentInput, "id" | "createdAt">): HubEquipmentInput {
  return { symptomKey: "slide", symptomText: "left corner", findings: [], ...overrides };
}

function ready<T>(records: readonly T[]): HubLane<T> {
  return { status: "ready", records };
}

describe("numericSeries", () => {
  it("is empty with no records, and a single record has no delta or sparkline", () => {
    expect(numericSeries([])).toEqual({ kind: "empty" });
    expect(numericSeries([12])).toEqual({ kind: "single", latest: 12 });
    expect(numericSeries([null])).toEqual({ kind: "single", latest: null });
  });

  it("subtracts the previous record from the latest and keeps the newest eight, oldest on the left", () => {
    expect(numericSeries([12, 10])).toEqual({ kind: "trend", latest: 12, delta: 2, spark: [10, 12] });
    expect(numericSeries([8, 11])).toMatchObject({ delta: -3, spark: [11, 8] });
    expect(numericSeries([5, 5])).toMatchObject({ delta: 0, spark: [5, 5] });

    const newestFirst = [9, 8, 7, 6, 5, 4, 3, 2, 1];
    const series = numericSeries(newestFirst);
    expect(series.kind).toBe("trend");
    if (series.kind !== "trend") return;
    expect(series.spark).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(series.spark).toHaveLength(HUB_SPARK_LIMIT);
    expect(newestFirst).toHaveLength(HUB_SPARK_LIMIT + 1);
  });

  it("does not turn a missing number into zero", () => {
    expect(numericSeries([null, 4])).toEqual({ kind: "trend", latest: null, delta: null, spark: [] });
    expect(numericSeries([4, null])).toEqual({ kind: "trend", latest: 4, delta: null, spark: [] });
    expect(numericSeries([null, null])).toEqual({ kind: "trend", latest: null, delta: null, spark: [] });
  });
});

describe("buildHubModel", () => {
  it("picks the first derived suggestion and skips one that was ignored", () => {
    const analyses = ready([
      analysis({
        kind: "pace",
        id: "pace-1",
        createdAt: "2026-10-20T00:00:00.000Z",
        decayPercent: 6,
        rating: "needs-work",
        findings: [{ code: "pace.decay.back-half" }],
      }),
      analysis({
        kind: "biomech",
        id: "bio-1",
        createdAt: "2026-10-21T00:00:00.000Z",
        avgLean: 40,
        avgKnee: 100,
        findings: [{ code: "biomech.knee.high" }],
      }),
    ]);
    const equipmentLane = ready([
      equipment({
        id: "eq-1",
        createdAt: "2026-10-22T00:00:00.000Z",
        findings: [{ code: "equipment.symptom.slide" }],
      }),
    ]);

    const first = buildHubModel({ analyses, equipment: equipmentLane, hidden: new Set() });
    expect(first.suggestion).toMatchObject({
      status: "ready",
      feedback: { type: "set-focus", focus: "bounce", sourceKind: "pace", analysisId: "pace-1" },
    });

    const hidden = new Set([
      trainingFeedbackKey({
        type: "set-focus",
        focus: "bounce",
        sourceKind: "pace",
        analysisId: "pace-1",
        createdAt: "2026-10-20T00:00:00.000Z",
      }),
    ]);
    const second = buildHubModel({ analyses, equipment: equipmentLane, hidden });
    expect(second.suggestion).toMatchObject({
      status: "ready",
      feedback: { type: "set-focus", focus: "lean", analysisId: "bio-1" },
    });
  });

  it("renders no suggestion card when both reads succeeded and nothing qualifies", () => {
    const model = buildHubModel({
      analyses: ready([analysis({ kind: "pace", id: "pace-1", createdAt: "2026-10-01T00:00:00.000Z" })]),
      equipment: ready([]),
      hidden: new Set(),
    });
    expect(model.suggestion).toEqual({ status: "none" });
  });

  it("keeps a read failure distinct from an empty lane", () => {
    const model = buildHubModel({
      analyses: { status: "error" },
      equipment: ready([
        equipment({
          id: "eq-1",
          createdAt: "2026-10-02T00:00:00.000Z",
          findings: [{ code: "equipment.symptom.slide" }],
        }),
      ]),
      hidden: new Set(),
    });
    expect(model.suggestion).toEqual({ status: "error" });
    expect(model.biomech).toEqual({ status: "error" });
    expect(model.pace).toEqual({ status: "error" });
    expect(model.equipment.status).toBe("ready");
    expect(model.tools.biomech).toEqual({ status: "error" });
    expect(model.tools.equipment.status).toBe("ready");
    expect(model.recent.status).toBe("error");
    if (model.recent.status !== "error") return;
    expect(model.recent.failed).toEqual(["analyses"]);
    expect(model.recent.items.map((item) => item.kind)).toEqual(["equipment"]);
  });

  it("still shows a pace suggestion when only equipment failed", () => {
    const model = buildHubModel({
      analyses: ready([
        analysis({
          kind: "pace",
          id: "pace-1",
          createdAt: "2026-10-03T00:00:00.000Z",
          decayPercent: 3,
          rating: "moderate",
          findings: [{ code: "pace.total.versus-benchmark" }],
        }),
      ]),
      equipment: { status: "error" },
      hidden: new Set(),
    });
    expect(model.suggestion).toMatchObject({ status: "ready", feedback: { analysisId: "pace-1" } });
    expect(model.equipment).toEqual({ status: "error" });
    expect(model.pace.status).toBe("single");
    expect(model.recent.status).toBe("error");
  });

  it("waits while a later source is still loading instead of saying there is no suggestion", () => {
    const model = buildHubModel({
      analyses: ready([]),
      equipment: { status: "loading" },
      hidden: new Set(),
    });
    expect(model.suggestion).toEqual({ status: "loading" });
    expect(model.recent).toEqual({ status: "loading" });
    expect(model.equipment).toEqual({ status: "loading" });
  });

  it("shows a value without a delta for one record, and a delta only from the two newest", () => {
    const one = buildHubModel({
      analyses: ready([
        analysis({ kind: "biomech", id: "bio-1", createdAt: "2026-10-04T00:00:00.000Z", avgLean: 42, avgKnee: 108 }),
      ]),
      equipment: ready([]),
      hidden: new Set(),
    });
    expect(one.biomech).toMatchObject({ status: "single", avgLean: 42, avgKnee: 108 });
    expect(one.pace).toEqual({ status: "empty" });

    const two = buildHubModel({
      analyses: ready([
        analysis({ kind: "biomech", id: "older", createdAt: "2026-10-01T00:00:00.000Z", avgLean: 40, avgKnee: 100 }),
        analysis({ kind: "biomech", id: "newer", createdAt: "2026-10-08T00:00:00.000Z", avgLean: 50, avgKnee: 100 }),
      ]),
      equipment: ready([]),
      hidden: new Set(),
    });
    expect(two.biomech).toMatchObject({
      status: "trend",
      lean: { latest: 50, delta: 10, spark: [40, 50] },
      knee: { latest: 100, delta: 0, spark: [100, 100] },
    });
  });

  it("keeps an old pace card on the rating and stability index when decay was not stored", () => {
    const model = buildHubModel({
      analyses: ready([
        analysis({
          kind: "pace",
          id: "pace-old",
          createdAt: "2026-10-01T00:00:00.000Z",
          rating: "excellent",
          stabilityIndexPercent: 80,
        }),
        analysis({
          kind: "pace",
          id: "pace-new",
          createdAt: "2026-10-09T00:00:00.000Z",
          rating: "needs-work",
          stabilityIndexPercent: 72,
        }),
      ]),
      equipment: ready([]),
      hidden: new Set(),
    });
    expect(model.pace).toEqual({
      status: "trend",
      createdAt: "2026-10-09T00:00:00.000Z",
      rating: "needs-work",
      stabilityIndexPercent: 72,
      decay: null,
    });
  });

  it("shows the stored decay line when the newest pace record has one", () => {
    const model = buildHubModel({
      analyses: ready([
        analysis({
          kind: "pace",
          id: "pace-old",
          createdAt: "2026-10-01T00:00:00.000Z",
          decayPercent: 4,
          stabilityIndexPercent: 80,
          rating: "excellent",
        }),
        analysis({
          kind: "pace",
          id: "pace-new",
          createdAt: "2026-10-09T00:00:00.000Z",
          decayPercent: 6.5,
          stabilityIndexPercent: 72,
          rating: "needs-work",
        }),
      ]),
      equipment: ready([]),
      hidden: new Set(),
    });
    expect(model.pace).toEqual({
      status: "trend",
      createdAt: "2026-10-09T00:00:00.000Z",
      rating: "needs-work",
      stabilityIndexPercent: 72,
      decay: { latest: 6.5, delta: 2.5, spark: [4, 6.5] },
    });
  });

  it("hides the decay line when only an older pace record stored one", () => {
    const model = buildHubModel({
      analyses: ready([
        analysis({
          kind: "pace",
          id: "pace-old",
          createdAt: "2026-10-01T00:00:00.000Z",
          decayPercent: 4,
          stabilityIndexPercent: 80,
          rating: "excellent",
        }),
        analysis({
          kind: "pace",
          id: "pace-new",
          createdAt: "2026-10-09T00:00:00.000Z",
          stabilityIndexPercent: 72,
          rating: "needs-work",
        }),
      ]),
      equipment: ready([]),
      hidden: new Set(),
    });
    expect(model.pace).toMatchObject({
      rating: "needs-work",
      stabilityIndexPercent: 72,
      decay: null,
    });
  });

  it("keeps the newest five records across the three kinds", () => {
    const analyses = ready([
      analysis({ kind: "biomech", id: "b1", createdAt: "2026-10-01T00:00:00.000Z", avgLean: 1, avgKnee: 1 }),
      analysis({ kind: "biomech", id: "b2", createdAt: "2026-10-03T00:00:00.000Z", avgLean: 2, avgKnee: 2 }),
      analysis({ kind: "pace", id: "p1", createdAt: "2026-10-02T00:00:00.000Z", decayPercent: 1, rating: "moderate" }),
      analysis({ kind: "pace", id: "p2", createdAt: "2026-10-04T00:00:00.000Z", decayPercent: 2, rating: "moderate" }),
      analysis({ kind: "pace", id: "p3", createdAt: "2026-10-05T00:00:00.000Z", decayPercent: 3, rating: "excellent" }),
    ]);
    const equipmentLane = ready([equipment({ id: "e1", createdAt: "2026-10-06T00:00:00.000Z" })]);
    const model = buildHubModel({ analyses, equipment: equipmentLane, hidden: new Set() });
    expect(model.recent.status).toBe("ready");
    if (model.recent.status !== "ready") return;
    expect(model.recent.items.map((item) => item.id)).toEqual(["e1", "p3", "p2", "b2", "p1"]);
    expect(model.recent.items).toHaveLength(HUB_RECENT_LIMIT);
    expect(model.equipment).toMatchObject({ status: "ready", symptomKey: "slide", symptomText: "left corner" });
  });
});
