import { readFileSync } from "node:fs";

import { getAcademyStage } from "@skatingx/content";
import { describe, expect, it } from "vitest";

import { linkedItemCategory, planCandidatesForStage } from "./plan-candidates";

const DATES = {
  monday: "2026-10-26",
  tuesday: "2026-10-27",
  wednesday: "2026-10-28",
  thursday: "2026-10-29",
  friday: "2026-10-30",
  saturday: "2026-10-31",
  sunday: "2026-11-01",
} as const;

/** Sorted routine ids for age 11–13. Wednesday and Sunday are the routine's recovery days, so they stay empty. */
const AGE11_13_IDS = {
  lean: {
    monday: ["age11_13-w0-t1", "age11_13-w0-t0", "age11_13-w0-t2", "age11_13-w0-t3", "age11_13-w0-t4"],
    tuesday: ["age11_13-w1-t4", "age11_13-w1-t5", "age11_13-w1-t6", "age11_13-w1-t0", "age11_13-w1-t1", "age11_13-w1-t2", "age11_13-w1-t3"],
    wednesday: [],
    thursday: ["age11_13-w3-t4", "age11_13-w3-t5", "age11_13-w3-t0", "age11_13-w3-t1", "age11_13-w3-t2", "age11_13-w3-t3"],
    friday: ["age11_13-w4-t0", "age11_13-w4-t1", "age11_13-w4-t2", "age11_13-w4-t3"],
    saturday: ["age11_13-w5-t2", "age11_13-w5-t3", "age11_13-w5-t4", "age11_13-w5-t0", "age11_13-w5-t1"],
    sunday: [],
  },
  bounce: {
    monday: ["age11_13-w0-t0", "age11_13-w0-t2", "age11_13-w0-t3", "age11_13-w0-t4", "age11_13-w0-t1"],
    tuesday: ["age11_13-w1-t4", "age11_13-w1-t5", "age11_13-w1-t6", "age11_13-w1-t0", "age11_13-w1-t1", "age11_13-w1-t2", "age11_13-w1-t3"],
    wednesday: [],
    thursday: ["age11_13-w3-t4", "age11_13-w3-t5", "age11_13-w3-t0", "age11_13-w3-t1", "age11_13-w3-t2", "age11_13-w3-t3"],
    friday: ["age11_13-w4-t1", "age11_13-w4-t2", "age11_13-w4-t3", "age11_13-w4-t0"],
    saturday: ["age11_13-w5-t2", "age11_13-w5-t3", "age11_13-w5-t4", "age11_13-w5-t0", "age11_13-w5-t1"],
    sunday: [],
  },
  endurance: {
    monday: ["age11_13-w0-t1", "age11_13-w0-t0", "age11_13-w0-t2", "age11_13-w0-t3"],
    tuesday: ["age11_13-w1-t4", "age11_13-w1-t5", "age11_13-w1-t6", "age11_13-w1-t0"],
    wednesday: [],
    thursday: ["age11_13-w3-t4", "age11_13-w3-t5", "age11_13-w3-t0", "age11_13-w3-t1"],
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

  it("reads a shared drill's category, and returns null for an unknown id", () => {
    const stage = getAcademyStage("age14_16");
    expect(stage).toBeTruthy();
    expect(linkedItemCategory(stage!, "shared-m0-i0")).toBe("recovery");
    expect(linkedItemCategory(stage!, "shared-m1-i0")).toBe("dryland");
    expect(linkedItemCategory(stage!, "age14_16-m0-i0")).toBe(stage!.modules[0]!.items[0]!.category);
    expect(linkedItemCategory(stage!, "missing")).toBeNull();
  });

  it("puts the shared warm-up first on an endurance Saturday", () => {
    expect(planCandidatesForStage("age14_16", "endurance", DATES.saturday, "zh").map((candidate) => candidate.planEntryId)).toEqual([
      "age14_16-w5-t0",
      "age14_16-w5-t1",
      "age14_16-w5-t2",
      "age14_16-w5-t3",
    ]);
  });

  it("does not read the PRO flag", () => {
    const source = readFileSync(new URL("./plan-candidates.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/isPro|useIsPro/);
  });

});

type WeekIds = Record<keyof typeof DATES, readonly string[]>;
type FocusIds = Record<"lean" | "bounce" | "endurance", WeekIds>;

const EMPTY_WEEK: WeekIds = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

const AGE4_7_IDS: FocusIds = {
  lean: {
    ...EMPTY_WEEK,
    tuesday: ["age4_7-w0-t1", "age4_7-w0-t4", "age4_7-w0-t3", "age4_7-w0-t0", "age4_7-w0-t2"],
    thursday: ["age4_7-w1-t1", "age4_7-w1-t0", "age4_7-w1-t2", "age4_7-w1-t4", "age4_7-w1-t3"],
    saturday: ["age4_7-w2-t0", "age4_7-w2-t2", "age4_7-w2-t3", "age4_7-w2-t1", "age4_7-w2-t4"],
  },
  bounce: {
    ...EMPTY_WEEK,
    tuesday: ["age4_7-w0-t1", "age4_7-w0-t4", "age4_7-w0-t0", "age4_7-w0-t2", "age4_7-w0-t3"],
    thursday: ["age4_7-w1-t4", "age4_7-w1-t1", "age4_7-w1-t2", "age4_7-w1-t0", "age4_7-w1-t3"],
    saturday: ["age4_7-w2-t1", "age4_7-w2-t4", "age4_7-w2-t0", "age4_7-w2-t2", "age4_7-w2-t3"],
  },
  endurance: {
    ...EMPTY_WEEK,
    tuesday: ["age4_7-w0-t1", "age4_7-w0-t4", "age4_7-w0-t0", "age4_7-w0-t2"],
    thursday: ["age4_7-w1-t3", "age4_7-w1-t1", "age4_7-w1-t2", "age4_7-w1-t4"],
    saturday: ["age4_7-w2-t0", "age4_7-w2-t2", "age4_7-w2-t3", "age4_7-w2-t1"],
  },
};

const AGE8_10_IDS: FocusIds = {
  lean: {
    ...EMPTY_WEEK,
    monday: ["age8_10-w0-t0", "age8_10-w0-t1", "age8_10-w0-t2", "age8_10-w0-t3"],
    tuesday: ["age8_10-w1-t0", "age8_10-w1-t1", "age8_10-w1-t2"],
    thursday: ["age8_10-w2-t2", "age8_10-w2-t3", "age8_10-w2-t4", "age8_10-w2-t0", "age8_10-w2-t1"],
    friday: ["age8_10-w3-t3", "age8_10-w3-t0", "age8_10-w3-t1", "age8_10-w3-t2"],
    saturday: ["age8_10-w4-t2", "age8_10-w4-t3", "age8_10-w4-t0", "age8_10-w4-t1"],
  },
  bounce: {
    ...EMPTY_WEEK,
    monday: ["age8_10-w0-t0", "age8_10-w0-t1", "age8_10-w0-t2", "age8_10-w0-t3"],
    tuesday: ["age8_10-w1-t0", "age8_10-w1-t1", "age8_10-w1-t2"],
    thursday: ["age8_10-w2-t0", "age8_10-w2-t1", "age8_10-w2-t2", "age8_10-w2-t3", "age8_10-w2-t4"],
    friday: ["age8_10-w3-t3", "age8_10-w3-t0", "age8_10-w3-t1", "age8_10-w3-t2"],
    saturday: ["age8_10-w4-t2", "age8_10-w4-t3", "age8_10-w4-t0", "age8_10-w4-t1"],
  },
  endurance: {
    ...EMPTY_WEEK,
    monday: ["age8_10-w0-t0", "age8_10-w0-t1", "age8_10-w0-t2", "age8_10-w0-t3"],
    tuesday: ["age8_10-w1-t0", "age8_10-w1-t1", "age8_10-w1-t2"],
    thursday: ["age8_10-w2-t2", "age8_10-w2-t3", "age8_10-w2-t4", "age8_10-w2-t0"],
    friday: ["age8_10-w3-t3", "age8_10-w3-t0", "age8_10-w3-t1", "age8_10-w3-t2"],
    saturday: ["age8_10-w4-t2", "age8_10-w4-t3", "age8_10-w4-t0", "age8_10-w4-t1"],
  },
};

const AGE14_16_IDS: FocusIds = {
  lean: {
    ...EMPTY_WEEK,
    monday: ["age14_16-w0-t0", "age14_16-w0-t1", "age14_16-w0-t2", "age14_16-w0-t3", "age14_16-w0-t4"],
    tuesday: ["age14_16-w1-t0", "age14_16-w1-t1", "age14_16-w1-t2"],
    thursday: ["age14_16-w3-t0", "age14_16-w3-t1", "age14_16-w3-t2", "age14_16-w3-t3"],
    friday: ["age14_16-w4-t0", "age14_16-w4-t1", "age14_16-w4-t3", "age14_16-w4-t2"],
    saturday: ["age14_16-w5-t0", "age14_16-w5-t1", "age14_16-w5-t2", "age14_16-w5-t3"],
  },
  bounce: {
    ...EMPTY_WEEK,
    monday: ["age14_16-w0-t0", "age14_16-w0-t1", "age14_16-w0-t2", "age14_16-w0-t3", "age14_16-w0-t4"],
    tuesday: ["age14_16-w1-t0", "age14_16-w1-t1", "age14_16-w1-t2"],
    thursday: ["age14_16-w3-t0", "age14_16-w3-t1", "age14_16-w3-t2", "age14_16-w3-t3"],
    friday: ["age14_16-w4-t2", "age14_16-w4-t0", "age14_16-w4-t1", "age14_16-w4-t3"],
    saturday: ["age14_16-w5-t0", "age14_16-w5-t1", "age14_16-w5-t2", "age14_16-w5-t3"],
  },
  endurance: {
    ...EMPTY_WEEK,
    monday: ["age14_16-w0-t0", "age14_16-w0-t1", "age14_16-w0-t2", "age14_16-w0-t3"],
    tuesday: ["age14_16-w1-t0", "age14_16-w1-t1", "age14_16-w1-t2"],
    thursday: ["age14_16-w3-t0", "age14_16-w3-t1", "age14_16-w3-t2", "age14_16-w3-t3"],
    friday: ["age14_16-w4-t0", "age14_16-w4-t1", "age14_16-w4-t3", "age14_16-w4-t2"],
    saturday: ["age14_16-w5-t0", "age14_16-w5-t1", "age14_16-w5-t2", "age14_16-w5-t3"],
  },
};

function expectStageIds(stageId: string | null, table: FocusIds) {
  for (const focus of ["lean", "bounce", "endurance"] as const) {
    for (const [weekday, date] of Object.entries(DATES)) {
      const expected = table[focus][weekday as keyof typeof DATES];
      const zh = planCandidatesForStage(stageId, focus, date, "zh");
      const en = planCandidatesForStage(stageId, focus, date, "en");
      expect(zh.map((candidate) => candidate.planEntryId)).toEqual(expected);
      expect(en.map((candidate) => candidate.planEntryId)).toEqual(expected);
      if (focus === "endurance") expect(zh.length).toBeLessThanOrEqual(4);
    }
  }
}

describe("planCandidatesForStage, every stage", () => {
  it("sorts 4-7, 8-10 and 14-16 by the same focus rule, and caps endurance at four", () => {
    expectStageIds("age4_7", AGE4_7_IDS);
    expectStageIds("age8_10", AGE8_10_IDS);
    expectStageIds("age14_16", AGE14_16_IDS);
  });

  it("generates nothing for 17-18 and for a missing stage", () => {
    expectStageIds("age17_18", { lean: EMPTY_WEEK, bounce: EMPTY_WEEK, endurance: EMPTY_WEEK });
    expectStageIds(null, { lean: EMPTY_WEEK, bounce: EMPTY_WEEK, endurance: EMPTY_WEEK });
  });
});
