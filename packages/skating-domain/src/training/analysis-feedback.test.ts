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
    ], null);

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
      ], null),
    ).toEqual([]);
  });

  it("does not turn an unreadable frame into training advice", () => {
    expect(
      deriveTrainingFeedback([
        source({ kind: "biomech", id: "bio-1", findings: [{ code: "biomech.frame.unreadable" }] }),
      ], null),
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
    expect(deriveTrainingFeedback(sources, null)).toEqual([]);
  });

  it("breaks a same-timestamp tie by id so the choice does not depend on list order", () => {
    const sources = [
      source({ kind: "equipment", id: "equip-a", findings: [{ code: "equipment.symptom.ankle" }] }),
      source({ kind: "equipment", id: "equip-b", findings: [{ code: "equipment.symptom.boot-out" }] }),
    ];
    expect(deriveTrainingFeedback(sources, null)[0]?.analysisId).toBe("equip-b");
    expect(deriveTrainingFeedback([...sources].reverse(), null)[0]?.analysisId).toBe("equip-b");
  });
});

describe("the focus that is already set", () => {
  const sources = [
    source({ kind: "pace", id: "pace-1", findings: [{ code: "pace.decay.back-half" }] }),
    source({ kind: "biomech", id: "bio-1", findings: [{ code: "biomech.lean.high" }] }),
    source({ kind: "equipment", id: "equip-1", findings: [{ code: "equipment.symptom.slide" }] }),
  ];
  const kinds = (focus: Parameters<typeof deriveTrainingFeedback>[1]) =>
    deriveTrainingFeedback(sources, focus).map((card) => (card.type === "set-focus" ? card.focus : card.type));

  it("with bounce set, the pace card goes and the biomechanics card stays", () => {
    expect(kinds("bounce")).toEqual(["lean", "review-equipment"]);
  });

  it("with lean set, the biomechanics card goes and the pace card stays", () => {
    expect(kinds("lean")).toEqual(["bounce", "review-equipment"]);
  });

  it("with no focus this week, nothing is filtered", () => {
    expect(kinds(null)).toEqual(["bounce", "lean", "review-equipment"]);
  });

  it("with endurance set, the analysis cards are not affected (they never suggest it)", () => {
    expect(kinds("endurance")).toEqual(["bounce", "lean", "review-equipment"]);
  });

  it("the equipment review card is never filtered, whatever the focus", () => {
    for (const focus of [null, "bounce", "lean", "endurance"] as const) {
      expect(kinds(focus)).toContain("review-equipment");
    }
  });

  it("the first card after filtering is the next one, so a caller taking the first gets a successor, not nothing", () => {
    expect(deriveTrainingFeedback(sources, "bounce")[0]).toMatchObject({ focus: "lean", analysisId: "bio-1" });
    expect(deriveTrainingFeedback(sources.slice(0, 1), "bounce")).toEqual([]);
  });
});

describe("an equipment record whose findings carry no symptom code", () => {
  const equipment = (over: Partial<FeedbackSource>) => source({ kind: "equipment", id: "equip-1", ...over });
  const review = (sources: FeedbackSource[]) => deriveTrainingFeedback(sources, null).filter((card) => card.type === "review-equipment");

  it("an empty findings list with a known symptom key still gives the review card", () => {
    expect(review([equipment({ findings: [], symptomKey: "slide" })])).toEqual([
      { type: "review-equipment", sourceKind: "equipment", analysisId: "equip-1", createdAt: "2026-10-20T12:00:00.000Z" },
    ]);
  });

  it("every one of the six symptom keys is known", () => {
    for (const symptomKey of ["slide", "boot-out", "unstable", "ankle", "release", "asymmetry"]) {
      expect(review([equipment({ findings: [], symptomKey })])).toHaveLength(1);
    }
  });

  it("an empty list with no symptom key gives nothing", () => {
    expect(review([equipment({ findings: [] })])).toEqual([]);
  });

  it("an empty list with an unknown symptom key gives nothing, including names from the prototype chain", () => {
    for (const symptomKey of ["unknown", "", "constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(review([equipment({ findings: [], symptomKey })])).toEqual([]);
    }
  });

  it("findings that already hold a symptom code still give the card, with no symptom key (as before)", () => {
    expect(review([equipment({ findings: [{ code: "equipment.symptom.ankle" }] })])).toHaveLength(1);
  });

  it("findings with some other code and a known key give the card: the condition is no symptom code, not an empty list", () => {
    expect(review([equipment({ findings: [{ code: "equipment.note.other" }], symptomKey: "unstable" })])).toHaveLength(1);
  });

  it("other kinds are not touched by a symptom key", () => {
    const withKey = (kind: "pace" | "biomech") => deriveTrainingFeedback([source({ kind, id: "x", findings: [], symptomKey: "slide" })], null);
    expect(withKey("pace")).toEqual([]);
    expect(withKey("biomech")).toEqual([]);
  });
});

