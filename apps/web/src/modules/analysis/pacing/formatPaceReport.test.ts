import { calculatePacingAnalysis, pacingDistanceConfigs } from "@skatingx/skating-domain";
import { describe, expect, it } from "vitest";

import { formatPaceReport } from "./formatPaceReport";

describe("formatPaceReport", () => {
  it("says even 0.000 when the totals match", () => {
    const distance = "500" as const;
    const splits = [...pacingDistanceConfigs[distance].defaults];
    const result = calculatePacingAnalysis(distance, splits, splits);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const labels = ["a", "b", "c", "d", "e"];
    expect(formatPaceReport("zh", distance, labels, result.analysis)).toContain("持平 0.000");
    expect(formatPaceReport("en", distance, labels, result.analysis)).toMatch(/0\.000 Even/);
  });
});
