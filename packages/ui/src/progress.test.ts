import { describe, expect, it } from "vitest";

import { normalizeProgress } from "./progress";

describe("normalizeProgress", () => {
  it("returns the share of the track to fill", () => {
    expect(normalizeProgress(3, 4)).toEqual({ value: 3, max: 4, fraction: 0.75 });
    expect(normalizeProgress(50, 100).fraction).toBe(0.5);
  });

  it("draws an empty bar for 0 of 0 (a day with no tasks)", () => {
    expect(normalizeProgress(0, 0)).toEqual({ value: 0, max: 0, fraction: 0 });
  });

  it("never overfills or goes below empty", () => {
    expect(normalizeProgress(9, 4)).toEqual({ value: 4, max: 4, fraction: 1 });
    expect(normalizeProgress(-2, 4)).toEqual({ value: 0, max: 4, fraction: 0 });
  });

  it.each([
    ["NaN value", Number.NaN, 4],
    ["Infinity value", Number.POSITIVE_INFINITY, 4],
    ["NaN max", 2, Number.NaN],
    ["negative max", 2, -1],
    ["Infinity max", 2, Number.POSITIVE_INFINITY],
  ])("draws an empty bar, not NaN%%, for %s", (_name, value, max) => {
    const result = normalizeProgress(value, max);
    expect(result.fraction).toBe(0);
    expect(Number.isFinite(result.value)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
  });
});
