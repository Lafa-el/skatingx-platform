import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildM5ParityReport } from "./m5-parity";
import { resetAnalysisSession } from "./legacy-pose";

const reportPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/migration/analysis/m5-parity-report.md",
);

describe("M5 parity", () => {
  it("matches the locked fixtures and the checked-in report", () => {
    const report = buildM5ParityReport();
    const unexplained = report.rows.filter((item) => !item.explained && item.difference !== "0");
    expect(unexplained).toEqual([]);
    expect(report.rows.filter((item) => item.explained).map((item) => item.metric)).toEqual([
      "生物力学 · fx-cancel-midway · poseClosed",
      "生物力学 · fx-cancel-midway · poseInstanceOpen",
      "计划 · 积分落点",
    ]);
    expect(report.markdown).toContain("容差已由 owner 于 2026-10-19 批准");
    expect(report.markdown).toContain("测试仍按精确相等失败");
    expect(report.rows.filter((item) => !item.explained).every((item) => item.withinTolerance === "是")).toBe(true);
    expect(readFileSync(reportPath, "utf8")).toBe(report.markdown);
  });

  it("keeps the cancel fixture aligned with reset, including the reviewed close", () => {
    const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
    const fixture = JSON.parse(readFileSync(join(fixtureDir, "fx-cancel-midway.json"), "utf8")) as {
      input: {
        started: boolean;
        objectUrl: string;
        keyframes: { id: string }[];
        kneeDisplay: string;
        leanDisplay: string;
        pelvisDisplay: string;
        recoveryDisplay: string;
        poseInstanceOpen: boolean;
      };
    };
    const expected = JSON.parse(readFileSync(join(fixtureDir, "fx-cancel-midway.expected.json"), "utf8"));
    expect(resetAnalysisSession(fixture.input)).toEqual(expected);
    expect(expected.poseClosed).toBe(true);
  });
});
