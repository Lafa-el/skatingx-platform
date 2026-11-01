import { aggregateKeyframes } from "@skatingx/skating-domain";
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
      biomech: { avgKnee: 110, avgLean: 45, readableFrames: 2 },
      pace: null,
      findings: [{ code: "biomech.knee.high" }],
    });
  });

  it("counts readable frames: all unreadable gives 0 and two empty averages, from the explicit count", () => {
    const source = savedAnalysisFromDocument("doc-u", {
      id: "bio-u",
      createdAt: "2026-10-10T00:00:00.000Z",
      findings: [{ code: "biomech.frame.unreadable" }],
      poseFrames: [
        { readable: false, kneeAngleDegrees: null, leanAngleDegrees: null },
        { readable: false, kneeAngleDegrees: 90, leanAngleDegrees: 30 },
        // readable but missing an angle: not readable by the tool's rule either
        { readable: true, kneeAngleDegrees: 100, leanAngleDegrees: null },
      ],
    });
    expect(source?.biomech).toEqual({ avgKnee: null, avgLean: null, readableFrames: 0 });
  });

  it("a mixed session: the count and the averages agree with aggregateKeyframes", () => {
    const frames = [
      { timeSeconds: 1, readable: true, kneeAngleDegrees: 100, leanAngleDegrees: 40 },
      { timeSeconds: 2, readable: false, kneeAngleDegrees: null, leanAngleDegrees: null },
      { timeSeconds: 3, readable: true, kneeAngleDegrees: 120, leanAngleDegrees: 50 },
      { timeSeconds: 4, readable: true, kneeAngleDegrees: null, leanAngleDegrees: 45 },
    ];
    const source = savedAnalysisFromDocument("doc-m", {
      id: "bio-m",
      createdAt: "2026-10-10T00:00:00.000Z",
      findings: [],
      poseFrames: frames,
    });
    const tool = aggregateKeyframes(
      frames.map((frame) => ({
        timeSeconds: frame.timeSeconds,
        readable: frame.readable,
        unreadableReason: null,
        kneeAngle: frame.kneeAngleDegrees,
        leanAngle: frame.leanAngleDegrees,
        pelvisHeight: null,
        recoveryRate: null,
        supportSide: "unknown" as const,
        supportConfidence: null,
        manual: false,
        issue: null,
      })),
    );
    expect(source?.biomech).toEqual({ avgKnee: tool.avgKnee, avgLean: tool.avgLean, readableFrames: tool.readable });
    expect(source?.biomech).toEqual({ avgKnee: 110, avgLean: 45, readableFrames: 2 });
  });

  it("a pace document has no biomech block", () => {
    const source = savedAnalysisFromDocument("doc-p", {
      id: "pace-x",
      createdAt: "2026-10-10T00:00:00.000Z",
      findings: [],
      pace: { rating: "moderate" },
    });
    expect(source?.biomech).toBeNull();
  });

  it("reads a stored decay and does not substitute the stability index", () => {
    const stored = savedAnalysisFromDocument("doc-2", {
      id: "pace-1",
      createdAt: "2026-10-11T00:00:00.000Z",
      findings: [{ code: "pace.decay.back-half" }],
      pace: { decayPercent: 4.5, stabilityIndexPercent: 80, rating: "needs-work" },
    });
    expect(stored?.pace).toEqual({
      decayPercent: 4.5,
      stabilityIndexPercent: 80,
      rating: "needs-work",
    });

    const missing = savedAnalysisFromDocument("doc-3", {
      id: "pace-2",
      createdAt: "2026-10-12T00:00:00.000Z",
      findings: [],
      pace: { stabilityIndexPercent: 80, rating: "excellent" },
    });
    expect(missing?.pace).toEqual({
      decayPercent: null,
      stabilityIndexPercent: 80,
      rating: "excellent",
    });
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

  it("reads the distance of a pace document, and an old or invalid one is an unknown distance, not a dropped row", () => {
    const base = { createdAt: "2026-10-12T00:00:00.000Z", findings: [], pace: { rating: "excellent" } };
    for (const distance of ["500", "777", "1000"] as const) {
      expect(savedAnalysisFromDocument(`doc-${distance}`, { ...base, id: `p-${distance}`, distance })?.distance).toBe(
        distance,
      );
    }
    const old = savedAnalysisFromDocument("doc-old", { ...base, id: "p-old" });
    expect(old).toMatchObject({ kind: "pace", id: "p-old", distance: null });
    for (const bad of ["800", 500, null, "", { x: 1 }]) {
      expect(savedAnalysisFromDocument("doc-bad", { ...base, id: "p-bad", distance: bad })).toMatchObject({
        kind: "pace",
        id: "p-bad",
        distance: null,
      });
    }
  });

  it("a biomechanics row never has a distance, even if the document carries one", () => {
    const source = savedAnalysisFromDocument("doc-b", {
      id: "bio-2",
      createdAt: "2026-10-10T00:00:00.000Z",
      findings: [],
      distance: "500",
      poseFrames: [],
    });
    expect(source).toMatchObject({ kind: "biomech", distance: null });
  });
});
