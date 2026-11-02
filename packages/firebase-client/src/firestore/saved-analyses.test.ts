import { aggregateKeyframes } from "@skatingx/skating-domain";
import { describe, expect, it, vi } from "vitest";

import { getSavedAnalysis, savedAnalysisFromDocument } from "./saved-analyses";

const firestoreMock = vi.hoisted(() => ({
  getDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
}));

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<typeof import("firebase/firestore")>("firebase/firestore");
  return { ...actual, getDoc: firestoreMock.getDoc, doc: firestoreMock.doc };
});

describe("savedAnalysisFromDocument", () => {
  it("averages readable biomechanics frames and ignores an unreadable one", () => {
    const source = savedAnalysisFromDocument("doc-1", {
      id: "bio-1",
      createdAt: "2026-10-10T00:00:00.000Z",
      findings: [{ code: "biomech.knee.high" }],
      poseFrames: [
        { timeSeconds: 1, readable: true, kneeAngleDegrees: 100, leanAngleDegrees: 40 },
        { timeSeconds: 2, readable: true, kneeAngleDegrees: 120, leanAngleDegrees: 50 },
        { timeSeconds: 3, readable: false, kneeAngleDegrees: 200, leanAngleDegrees: 200 },
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
        { timeSeconds: 1, readable: false, kneeAngleDegrees: null, leanAngleDegrees: null },
        { timeSeconds: 2, readable: false, kneeAngleDegrees: 90, leanAngleDegrees: 30 },
        // readable but missing an angle: not readable by the tool's rule either
        { timeSeconds: 3, readable: true, kneeAngleDegrees: 100, leanAngleDegrees: null },
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
    expect(stored?.pace).toMatchObject({
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
    expect(missing?.pace).toMatchObject({
      decayPercent: null,
      stabilityIndexPercent: 80,
      rating: "excellent",
    });
  });

  describe("the totals a pace document stores", () => {
    const read = (pace: unknown) =>
      savedAnalysisFromDocument("doc-t", { id: "pace-t", createdAt: "2026-10-11T00:00:00.000Z", findings: [], pace })?.pace;
    const stored = { decayPercent: 4.5, stabilityIndexPercent: 80, rating: "excellent" };

    it("passes all three through as stored", () => {
      expect(read({ ...stored, totalSeconds: 52.34, benchmarkTotalSeconds: 50.1, trainingEmphasisRatio: "60:40" })).toEqual({
        ...stored,
        totalSeconds: 52.34,
        benchmarkTotalSeconds: 50.1,
        trainingEmphasisRatio: "60:40",
      });
    });

    it("each is null when the document has no such field (a record saved before)", () => {
      expect(read(stored)).toMatchObject({ totalSeconds: null, benchmarkTotalSeconds: null, trainingEmphasisRatio: null });
    });

    it("a number that is a string, NaN or infinite is null", () => {
      expect(read({ ...stored, totalSeconds: "52.34", benchmarkTotalSeconds: Number.NaN })).toMatchObject({
        totalSeconds: null,
        benchmarkTotalSeconds: null,
      });
      expect(read({ ...stored, totalSeconds: Number.POSITIVE_INFINITY })).toMatchObject({ totalSeconds: null });
    });

    it("a ratio that is not a string, is empty or is longer than 16 characters is null; 16 is kept", () => {
      expect(read({ ...stored, trainingEmphasisRatio: 60 })).toMatchObject({ trainingEmphasisRatio: null });
      expect(read({ ...stored, trainingEmphasisRatio: "" })).toMatchObject({ trainingEmphasisRatio: null });
      expect(read({ ...stored, trainingEmphasisRatio: "x".repeat(17) })).toMatchObject({ trainingEmphasisRatio: null });
      expect(read({ ...stored, trainingEmphasisRatio: "x".repeat(16) })).toMatchObject({ trainingEmphasisRatio: "x".repeat(16) });
    });

    it("a pace that is not an object leaves all three null", () => {
      const row = savedAnalysisFromDocument("doc-s", {
        id: "pace-s",
        createdAt: "2026-10-11T00:00:00.000Z",
        findings: [],
        pace: "broken",
      });
      expect(row?.pace).toEqual({
        decayPercent: null,
        stabilityIndexPercent: null,
        rating: null,
        totalSeconds: null,
        benchmarkTotalSeconds: null,
        trainingEmphasisRatio: null,
      });
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

  it("passes the stored frame fields through, and drops a frame whose time is not a finite number", () => {
    const source = savedAnalysisFromDocument("doc-f", {
      id: "bio-f",
      createdAt: "2026-10-10T00:00:00.000Z",
      findings: [],
      poseFrames: [
        {
          timeSeconds: 1.5,
          readable: true,
          unreadableReason: "no-pose",
          kneeAngleDegrees: 100,
          leanAngleDegrees: 40,
          pelvisHeightRatio: 0.42,
          recoveryRate: 1.2,
          supportLeg: { side: "left", confidencePercent: 80, manual: true },
        },
        { timeSeconds: "1", readable: true, kneeAngleDegrees: 200, leanAngleDegrees: 90 },
        { readable: true, kneeAngleDegrees: 200, leanAngleDegrees: 90 },
      ],
    });
    expect(source?.biomech).toEqual({ avgKnee: 100, avgLean: 40, readableFrames: 1 });
  });

describe("getSavedAnalysis", () => {
  const db = {} as never;

  it("returns the document's frames, and drops a frame whose time is not finite", async () => {
    firestoreMock.getDoc.mockResolvedValue({
      id: "bio-1",
      exists: () => true,
      data: () => ({
        id: "bio-1",
        createdAt: "2026-10-18T00:00:00.000Z",
        findings: [{ code: "biomech.knee.high" }],
        poseFrames: [
          {
            timeSeconds: 1.2,
            readable: true,
            kneeAngleDegrees: 100,
            leanAngleDegrees: 40,
            pelvisHeightRatio: 42.5,
            supportLeg: { side: "left", confidencePercent: 80, manual: true },
          },
          {
            timeSeconds: 2,
            readable: false,
            unreadableReason: "occlusion-or-jump",
            supportLeg: { side: "unknown", confidencePercent: 10, manual: false },
          },
          { readable: true, kneeAngleDegrees: 200 },
        ],
      }),
    });
    const detail = await getSavedAnalysis(db, "user-1", "bio-1");
    expect(firestoreMock.getDoc.mock.calls[0]?.[0]).toMatchObject({ path: expect.stringContaining("users/user-1/analyses/bio-1") });
    expect(detail?.biomech).toEqual({ avgKnee: 100, avgLean: 40, readableFrames: 1 });
    expect(detail?.frames).toEqual([
      {
        timeSeconds: 1.2,
        kneeAngle: 100,
        leanAngle: 40,
        pelvisHeight: 42.5,
        supportSide: "left",
        supportConfidence: 80,
        readable: true,
        unreadableReason: null,
        manual: true,
      },
      {
        timeSeconds: 2,
        kneeAngle: null,
        leanAngle: null,
        pelvisHeight: null,
        supportSide: "unknown",
        supportConfidence: 10,
        readable: false,
        unreadableReason: "occlusion-or-jump",
        manual: false,
      },
    ]);
  });

  it("returns null when the document is missing", async () => {
    firestoreMock.getDoc.mockResolvedValue({ id: "gone", exists: () => false, data: () => undefined });
    expect(await getSavedAnalysis(db, "user-1", "gone")).toBeNull();
  });

  it("returns null when the document is malformed", async () => {
    firestoreMock.getDoc.mockResolvedValue({
      id: "bad",
      exists: () => true,
      data: () => ({ poseFrames: [{ timeSeconds: 1, readable: true }] }),
    });
    expect(await getSavedAnalysis(db, "user-1", "bad")).toBeNull();
  });
});

