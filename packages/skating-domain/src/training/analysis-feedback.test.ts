import { describe, expect, it } from "vitest";

import {
  deriveTrainingFeedback,
  latestFeedbackSourceByKind,
  type FeedbackSource,
} from "./analysis-feedback";

function source(overrides: Partial<FeedbackSource> & Pick<FeedbackSource, "kind" | "id">): FeedbackSource {
  return {
    createdAt: "2026-10-20T12:00:00.000Z",
    findings: [],
    ...overrides,
  };
}

describe("analysis feedback", () => {
  it("maps pace and biomechanics codes onto one focus card each, and equipment onto a review card", () => {
    const cards = deriveTrainingFeedback([
      source({
        kind: "pace",
        id: "pace-1",
        findings: [{ code: "pace.decay.back-half" }, { code: "pace.total.versus-benchmark" }],
      }),
      source({
        kind: "biomech",
        id: "bio-1",
        findings: [{ code: "biomech.knee.high" }, { code: "biomech.lean.high" }, { code: "biomech.pelvis.high" }],
      }),
      source({
        kind: "equipment",
        id: "equip-1",
        findings: [{ code: "equipment.symptom.slide" }],
      }),
    ]);

    expect(cards).toEqual([
      {
        type: "set-focus",
        focus: "bounce",
        sourceKind: "pace",
        analysisId: "pace-1",
        createdAt: "2026-10-20T12:00:00.000Z",
      },
      {
        type: "set-focus",
        focus: "lean",
        sourceKind: "biomech",
        analysisId: "bio-1",
        createdAt: "2026-10-20T12:00:00.000Z",
      },
      {
        type: "review-equipment",
        sourceKind: "equipment",
        analysisId: "equip-1",
        createdAt: "2026-10-20T12:00:00.000Z",
      },
    ]);
  });

  it("does not suggest a pace focus when the latest pace record has no findings", () => {
    expect(
      deriveTrainingFeedback([
        source({
          kind: "pace",
          id: "pace-excellent",
          findings: [],
        }),
      ]),
    ).toEqual([]);
  });

  it("does not turn an unreadable frame into training advice", () => {
    expect(
      deriveTrainingFeedback([
        source({ kind: "biomech", id: "bio-1", findings: [{ code: "biomech.frame.unreadable" }] }),
      ]),
    ).toEqual([]);
  });

  it("keeps the latest document of each kind and drops the older findings", () => {
    const sources = [
      source({
        kind: "pace",
        id: "pace-old",
        createdAt: "2026-10-01T00:00:00.000Z",
        findings: [{ code: "pace.decay.back-half" }],
      }),
      source({
        kind: "pace",
        id: "pace-new",
        createdAt: "2026-10-19T00:00:00.000Z",
        findings: [],
      }),
      source({
        kind: "biomech",
        id: "bio-old",
        createdAt: "2026-10-02T00:00:00.000Z",
        findings: [{ code: "biomech.knee.high" }],
      }),
      source({
        kind: "biomech",
        id: "bio-new",
        createdAt: "2026-10-18T00:00:00.000Z",
        findings: [{ code: "biomech.frame.unreadable" }],
      }),
    ];

    expect(latestFeedbackSourceByKind(sources).pace?.id).toBe("pace-new");
    expect(latestFeedbackSourceByKind(sources).biomech?.id).toBe("bio-new");
    expect(deriveTrainingFeedback(sources)).toEqual([]);
  });

  it("breaks a same-timestamp tie by id so the choice does not depend on list order", () => {
    const sources = [
      source({ kind: "equipment", id: "equip-a", findings: [{ code: "equipment.symptom.ankle" }] }),
      source({ kind: "equipment", id: "equip-b", findings: [{ code: "equipment.symptom.boot-out" }] }),
    ];
    expect(deriveTrainingFeedback(sources)[0]?.analysisId).toBe("equip-b");
    expect(deriveTrainingFeedback([...sources].reverse())[0]?.analysisId).toBe("equip-b");
  });
});
