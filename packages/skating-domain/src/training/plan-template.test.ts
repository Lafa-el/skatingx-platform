import { describe, expect, it } from "vitest";

import {
  PLAN_DAYS,
  PLAN_FOCUSES,
  applyPlanCheckIn,
  planDayById,
  planDays,
  weeklyCheckedPoints,
} from "./plan-template";

describe("plan template", () => {
  it("keeps 21 client day cards, seven for each focus", () => {
    expect(PLAN_DAYS).toHaveLength(21);
    expect(new Set(PLAN_DAYS.map((day) => day.id)).size).toBe(21);
    for (const focus of PLAN_FOCUSES) {
      expect(planDays(focus)).toHaveLength(7);
    }
  });

  it("sums only the checked days of the selected focus", () => {
    const checked = new Set(["jd_tech_mon", "jd_tech_sun", "jd_speed_mon"]);
    expect(weeklyCheckedPoints("lean", checked)).toBe(40);
    expect(weeklyCheckedPoints("bounce", checked)).toBe(35);
    expect(weeklyCheckedPoints("endurance", checked)).toBe(0);
  });

  it("adds the template award once, and leaves an existing check-in unchanged", () => {
    expect(planDayById("jd_tech_mon")?.points).toBe(30);
    expect(applyPlanCheckIn(120, 30, false)).toBe(150);
    expect(applyPlanCheckIn(150, 30, true)).toBe(150);
    expect(planDayById("missing")).toBeUndefined();
  });
});
