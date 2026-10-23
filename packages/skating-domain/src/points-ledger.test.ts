import { describe, expect, it } from "vitest";

import { clampPointsDeltas } from "./points-ledger";

describe("clampPointsDeltas", () => {
  it("keeps a gain and a loss that stay above zero", () => {
    const result = clampPointsDeltas(100, [
      { dateId: "2026-10-23", delta: 20, reason: "task-complete", refId: "t1" },
      { dateId: "2026-10-23", delta: -5, reason: "task-uncomplete", refId: "t1" },
    ]);
    expect(result.points).toBe(115);
    expect(result.applied.map((event) => event.delta)).toEqual([20, -5]);
  });

  it("records only the points that were actually removed once the balance hits zero", () => {
    const result = clampPointsDeltas(30, [
      { dateId: "2026-10-23", delta: -20, reason: "task-uncomplete", refId: "t1" },
      { dateId: "2026-10-23", delta: -50, reason: "daily-bonus-remove" },
    ]);
    expect(result.points).toBe(0);
    expect(result.applied.map((event) => event.delta)).toEqual([-20, -10]);
    expect(result.applied.reduce((sum, event) => sum + event.delta, 0)).toBe(-30);
  });

  it("skips a draft that has nothing left to remove", () => {
    const result = clampPointsDeltas(0, [
      { dateId: "2026-10-23", delta: -20, reason: "history-delete", refId: "2026-10-23" },
    ]);
    expect(result).toEqual({ points: 0, applied: [] });
  });
});
