import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  doc: vi.fn((...parts: unknown[]) => ({ kind: "doc", parts })),
  getDoc: vi.fn(async (..._args: unknown[]): Promise<{ exists: () => boolean }> => ({ exists: () => false })),
  onSnapshot: vi.fn((..._args: unknown[]) => () => undefined),
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("firebase/firestore", () => firestore);

import {
  buildWeeklyReviewWrite,
  saveWeeklyReview,
  subscribeToWeeklyReview,
  weeklyReviewFromDocument,
} from "./journal-weekly-reviews";

const NOW = "2026-11-09T12:00:00.000Z";
const MONDAY = "2026-11-09";

describe("weekly reviews", () => {
  beforeEach(() => {
    firestore.getDoc.mockReset();
    firestore.setDoc.mockReset();
    firestore.onSnapshot.mockReset();
  });

  it("refuses a week start that is not a Monday and writes nothing", async () => {
    expect(buildWeeklyReviewWrite("2026-11-10", { bestMoment: "冰" }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "weekStart",
    });
    expect(buildWeeklyReviewWrite("2026-11-15", { bestMoment: "冰" }, { now: NOW, creating: true }).ok).toBe(false);
    const saved = await saveWeeklyReview({} as never, "user-1", "2026-02-31", { bestMoment: "冰" }, NOW);
    expect(saved).toEqual({ ok: false, field: "weekStart" });
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(firestore.getDoc).not.toHaveBeenCalled();
  });

  it("keeps one document when the same week is saved twice", async () => {
    firestore.getDoc.mockResolvedValueOnce({ exists: () => false }).mockResolvedValueOnce({ exists: () => true });
    const first = await saveWeeklyReview({} as never, "user-1", MONDAY, { bestMoment: "第一" }, NOW);
    const second = await saveWeeklyReview({} as never, "user-1", MONDAY, { bestMoment: "第二" }, NOW);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(firestore.setDoc).toHaveBeenCalledTimes(2);
    const [firstRef, firstData, firstOptions] = firestore.setDoc.mock.calls[0] as [
      { parts: unknown[] },
      Record<string, unknown>,
      unknown,
    ];
    const [secondRef, secondData, secondOptions] = firestore.setDoc.mock.calls[1] as [
      { parts: unknown[] },
      Record<string, unknown>,
      unknown,
    ];
    expect(firstRef.parts.at(-1)).toBe(MONDAY);
    expect(secondRef.parts.at(-1)).toBe(MONDAY);
    expect(firstRef.parts.slice(1)).toEqual([
      "artifacts",
      "skatingx-production",
      "users",
      "user-1",
      "journal",
      "main",
      "weeklyReviews",
      MONDAY,
    ]);
    expect(firstData).toEqual({ weekStart: MONDAY, bestMoment: "第一", updatedAt: NOW, createdAt: NOW });
    expect(secondData).toEqual({ weekStart: MONDAY, bestMoment: "第二", updatedAt: NOW });
    expect(secondData).not.toHaveProperty("createdAt");
    expect(firstOptions).toEqual({ merge: true });
    expect(secondOptions).toEqual({ merge: true });
  });

  it("leaves blank sentences off the document", () => {
    const built = buildWeeklyReviewWrite(
      MONDAY,
      { bestMoment: "  ", nextWeekFocus: "", parentSummary: "给家长" },
      { now: NOW, creating: false },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data).toEqual({ weekStart: MONDAY, parentSummary: "给家长", updatedAt: NOW });
    expect(built.data).not.toHaveProperty("bestMoment");
    expect(built.data).not.toHaveProperty("nextWeekFocus");
    expect(built.data).not.toHaveProperty("createdAt");
  });

  it("reads the three sentences", () => {
    expect(
      weeklyReviewFromDocument(MONDAY, {
        weekStart: MONDAY,
        bestMoment: " 最好 ",
        nextWeekFocus: "弯",
        parentSummary: "给家长",
        ignored: 1,
      }),
    ).toEqual({
      id: MONDAY,
      weekStart: MONDAY,
      bestMoment: "最好",
      nextWeekFocus: "弯",
      parentSummary: "给家长",
    });
  });

  it("reports a missing document as an empty week", () => {
    let received: unknown = "unset";
    firestore.onSnapshot.mockImplementation((...args: unknown[]) => {
      const onData = args[1] as (snapshot: { exists: () => boolean }) => void;
      onData({ exists: () => false });
      return () => undefined;
    });
    subscribeToWeeklyReview({} as never, "user-1", MONDAY, (review) => {
      received = review;
    }, () => undefined);
    expect(received).toBeNull();
    const [ref] = firestore.onSnapshot.mock.calls[0] as [{ parts: unknown[] }];
    expect(ref.parts.at(-1)).toBe(MONDAY);
  });
});
