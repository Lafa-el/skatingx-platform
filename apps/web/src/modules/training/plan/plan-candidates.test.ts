import { readFileSync } from "node:fs";

import { PLAN_DAYS } from "@skatingx/skating-domain";
import { describe, expect, it } from "vitest";

import { planCandidatesFor } from "./plan-candidates";
import { PLAN_DAY_ENTRIES } from "./plan-day-entries";

describe("planCandidatesFor", () => {
  it("turns the weekday's entries into strings in the language of the day it is called in", () => {
    // 2026-10-26 is a Monday.
    expect(planCandidatesFor("lean", "2026-10-26", "zh").slice(0, 2)).toEqual([
      { planEntryId: "jd_tech_mon.1", text: "动态热身与髋踝激活", description: "冰前" },
      { planEntryId: "jd_tech_mon.2", text: "干地滑行姿势", target: "6组20秒", description: "冰前" },
    ]);
    expect(planCandidatesFor("lean", "2026-10-26", "en").slice(0, 2)).toEqual([
      { planEntryId: "jd_tech_mon.1", text: "Dynamic warm-up and hip and ankle activation", description: "Land warm-up" },
      { planEntryId: "jd_tech_mon.2", text: "Dry-land skating posture", target: "6 sets of 20 seconds", description: "Land warm-up" },
    ]);
  });

  it("gives the same entry ids in both languages", () => {
    for (const day of ["2026-10-26", "2026-10-27", "2026-10-29", "2026-10-31"]) {
      expect(planCandidatesFor("bounce", day, "zh").map((c) => c.planEntryId)).toEqual(
        planCandidatesFor("bounce", day, "en").map((c) => c.planEntryId),
      );
    }
  });

  it("generates nothing on a rest day, and every other day gets at most five tasks", () => {
    expect(planCandidatesFor("lean", "2026-11-01", "zh")).toEqual([]);
    for (const focus of ["lean", "bounce", "endurance"] as const) {
      for (let day = 26; day <= 31; day += 1) {
        const count = planCandidatesFor(focus, `2026-10-${day}`, "zh").length;
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(5);
      }
    }
  });

  it("only ever produces ids that exist in the entry table", () => {
    const known = new Set(Object.values(PLAN_DAY_ENTRIES).flatMap((entries) => entries.map((entry) => entry.id)));
    expect(PLAN_DAYS).toHaveLength(21);
    for (const candidate of planCandidatesFor("endurance", "2026-10-31", "zh")) {
      expect(known.has(candidate.planEntryId)).toBe(true);
    }
  });

  it("does not read the PRO flag", () => {
    const source = readFileSync(new URL("./plan-candidates.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/isPro|useIsPro/);
  });
});
