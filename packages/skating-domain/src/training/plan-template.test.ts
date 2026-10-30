import { describe, expect, it } from "vitest";

import { PLAN_DAYS, PLAN_FOCUSES, planDayById, planDays } from "./plan-template";

describe("plan template", () => {
  it("keeps 21 client day cards, seven for each focus", () => {
    expect(PLAN_DAYS).toHaveLength(21);
    expect(new Set(PLAN_DAYS.map((day) => day.id)).size).toBe(21);
    for (const focus of PLAN_FOCUSES) {
      expect(planDays(focus)).toHaveLength(7);
    }
  });

  it("resolves a day id to its focus, and leaves unknown ids undefined", () => {
    expect(planDayById("jd_tech_mon")?.focus).toBe("lean");
    expect(planDayById("jd_speed_wed")?.focus).toBe("bounce");
    expect(planDayById("jd_race_sun")?.focus).toBe("endurance");
    expect(planDayById("missing")).toBeUndefined();
  });

  it("no longer carries per-day points (ADR-008: points come from tasks)", () => {
    for (const day of PLAN_DAYS) {
      expect(Object.keys(day).sort()).toEqual(["focus", "id"]);
    }
  });
});
