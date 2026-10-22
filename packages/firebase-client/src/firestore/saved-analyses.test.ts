import { describe, expect, it } from "vitest";

import { savedAnalysisFromDocument } from "./saved-analyses";

describe("savedAnalysisFromDocument", () => {
  it("averages readable biomechanics frames and ignores an unreadable one", () => {
    const source = savedAnalysisFromDocument("doc-1", {
      id: "bio-1",
      createdAt: "2026-10-10T00:00:00.000Z",
      findings: [{ code: "biomech.knee.high" }],
      poseFrames: [
        { readable: true, kneeAngleDegrees: 100, leanAngleDegrees: 40 },
        { readable: true, kneeAngleDegrees: 120, leanAngleDegrees: 50 },
        { readable: false, kneeAngleDegrees: 200, leanAngleDegrees: 200 },
      ],
    });
    expect(source).toMatchObject({
      kind: "biomech",
      id: "bio-1",
      biomech: { avgKnee: 110, avgLean: 45 },
      pace: null,
      findings: [{ code: "biomech.knee.high" }],
    });
  });

  it("reads a stored decay and does not substitute the stability index", () => {
    const stored = savedAnalysisFromDocument("doc-2", {
      id: "pace-1",
      createdAt: "2026-10-11T00:00:00.000Z",
      findings: [{ code: "pace.decay.back-half" }],
      pace: { decayPercent: 4.5, stabilityIndexPercent: 80, rating: "needs-work" },
    });
    expect(stored?.pace).toEqual({ decayPercent: 4.5, rating: "needs-work" });

    const missing = savedAnalysisFromDocument("doc-3", {
      id: "pace-2",
      createdAt: "2026-10-12T00:00:00.000Z",
      findings: [],
      pace: { stabilityIndexPercent: 80, rating: "excellent" },
    });
    expect(missing?.pace).toEqual({ decayPercent: null, rating: "excellent" });
  });

  it("drops a document that is not exactly one kind, or has no createdAt", () => {
    expect(savedAnalysisFromDocument("doc-4", { createdAt: "2026-10-01T00:00:00.000Z" })).toBeNull();
    expect(
      savedAnalysisFromDocument("doc-5", {
        createdAt: "2026-10-01T00:00:00.000Z",
        pace: { rating: "moderate" },
        poseFrames: [],
      }),
    ).toBeNull();
    expect(savedAnalysisFromDocument("doc-6", { poseFrames: [] })).toBeNull();
  });
});
