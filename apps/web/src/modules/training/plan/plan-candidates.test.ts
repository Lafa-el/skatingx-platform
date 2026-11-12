import { readFileSync } from "node:fs";

import { PLAN_DAYS } from "@skatingx/skating-domain";
import { describe, expect, it } from "vitest";

import { planCandidatesFor, planCandidatesForStage } from "./plan-candidates";
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

const DATES = {
  monday: "2026-10-26",
  tuesday: "2026-10-27",
  wednesday: "2026-10-28",
  thursday: "2026-10-29",
  friday: "2026-10-30",
  saturday: "2026-10-31",
  sunday: "2026-11-01",
} as const;

/** Sorted routine ids for age 11–13. Thursday and Sunday are recovery in the old skeleton, so they stay empty. */
const AGE11_13_IDS = {
  lean: {
    monday: ["age11_13-w0-t1", "age11_13-w0-t0", "age11_13-w0-t2", "age11_13-w0-t3", "age11_13-w0-t4"],
    tuesday: ["age11_13-w1-t4", "age11_13-w1-t5", "age11_13-w1-t6", "age11_13-w1-t0", "age11_13-w1-t1", "age11_13-w1-t2", "age11_13-w1-t3"],
    wednesday: ["age11_13-w2-t0", "age11_13-w2-t1", "age11_13-w2-t2", "age11_13-w2-t3"],
    thursday: [],
    friday: ["age11_13-w4-t0", "age11_13-w4-t1", "age11_13-w4-t2", "age11_13-w4-t3"],
    saturday: ["age11_13-w5-t2", "age11_13-w5-t3", "age11_13-w5-t4", "age11_13-w5-t0", "age11_13-w5-t1"],
    sunday: [],
  },
  bounce: {
    monday: ["age11_13-w0-t0", "age11_13-w0-t2", "age11_13-w0-t3", "age11_13-w0-t4", "age11_13-w0-t1"],
    tuesday: ["age11_13-w1-t4", "age11_13-w1-t5", "age11_13-w1-t6", "age11_13-w1-t0", "age11_13-w1-t1", "age11_13-w1-t2", "age11_13-w1-t3"],
    wednesday: ["age11_13-w2-t0", "age11_13-w2-t1", "age11_13-w2-t2", "age11_13-w2-t3"],
    thursday: [],
    friday: ["age11_13-w4-t1", "age11_13-w4-t2", "age11_13-w4-t3", "age11_13-w4-t0"],
    saturday: ["age11_13-w5-t2", "age11_13-w5-t3", "age11_13-w5-t4", "age11_13-w5-t0", "age11_13-w5-t1"],
    sunday: [],
  },
  endurance: {
    monday: ["age11_13-w0-t1", "age11_13-w0-t0", "age11_13-w0-t2", "age11_13-w0-t3"],
    tuesday: ["age11_13-w1-t4", "age11_13-w1-t5", "age11_13-w1-t6", "age11_13-w1-t0"],
    wednesday: ["age11_13-w2-t0", "age11_13-w2-t1", "age11_13-w2-t2", "age11_13-w2-t3"],
    thursday: [],
    friday: ["age11_13-w4-t0", "age11_13-w4-t1", "age11_13-w4-t2", "age11_13-w4-t3"],
    saturday: ["age11_13-w5-t2", "age11_13-w5-t3", "age11_13-w5-t4", "age11_13-w5-t0"],
    sunday: [],
  },
} as const;

describe("planCandidatesForStage", () => {
  it("sorts the 11-13 routine by focus, and uses the same ids in both languages", () => {
    for (const focus of ["lean", "bounce", "endurance"] as const) {
      for (const [weekday, date] of Object.entries(DATES)) {
        const expected = AGE11_13_IDS[focus][weekday as keyof typeof DATES];
        const zh = planCandidatesForStage("age11_13", focus, date, "zh");
        const en = planCandidatesForStage("age11_13", focus, date, "en");
        expect(zh.map((candidate) => candidate.planEntryId)).toEqual(expected);
        expect(en.map((candidate) => candidate.planEntryId)).toEqual(expected);
        expect(zh.every((candidate) => candidate.target === undefined)).toBe(true);
      }
    }
    expect(planCandidatesForStage("age11_13", "lean", DATES.tuesday, "zh")).toHaveLength(7);
  });

  it("keeps an endurance day at four tasks or fewer", () => {
    for (const date of Object.values(DATES)) {
      expect(planCandidatesForStage("age11_13", "endurance", date, "zh").length).toBeLessThanOrEqual(4);
    }
  });

  it("leaves every other stage on the old template", () => {
    for (const stageId of ["age8_10", null]) {
      for (const focus of ["lean", "bounce", "endurance"] as const) {
        for (const date of Object.values(DATES)) {
          expect(planCandidatesForStage(stageId, focus, date, "zh")).toEqual(planCandidatesFor(focus, date, "zh"));
          expect(planCandidatesForStage(stageId, focus, date, "en")).toEqual(planCandidatesFor(focus, date, "en"));
        }
      }
    }
  });
});
