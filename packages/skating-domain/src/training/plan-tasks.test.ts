import type { TrainingState, TrainingTask } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import { normalizeTask, normalizeTrainingState } from "../tasks";
import {
  buildTaskFromPlanCandidate,
  filterNewPlanCandidates,
  mondayOfWeek,
  planDayIdFor,
  planGenerationSkip,
} from "./plan-tasks";
import { PLAN_DAYS } from "./plan-template";

describe("mondayOfWeek", () => {
  it("returns the Monday of a Monday-to-Sunday week", () => {
    expect(mondayOfWeek("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(mondayOfWeek("2026-10-29")).toBe("2026-10-26"); // Thursday
    expect(mondayOfWeek("2026-11-01")).toBe("2026-10-26"); // Sunday closes the week
    expect(mondayOfWeek("2026-11-02")).toBe("2026-11-02");
  });

  it("crosses a month and a year", () => {
    expect(mondayOfWeek("2026-01-01")).toBe("2025-12-29");
  });
});

describe("planDayIdFor", () => {
  it("lays each focus on the weekday of the date, and every id is a real template day", () => {
    expect(planDayIdFor("lean", "2026-10-26")).toBe("jd_tech_mon");
    expect(planDayIdFor("bounce", "2026-10-29")).toBe("jd_speed_thu");
    expect(planDayIdFor("endurance", "2026-11-01")).toBe("jd_race_sun");
    const ids = new Set(PLAN_DAYS.map((day) => day.id));
    for (const focus of ["lean", "bounce", "endurance"] as const) {
      for (let day = 26; day <= 31; day += 1) {
        expect(ids.has(planDayIdFor(focus, `2026-10-${day}`))).toBe(true);
      }
    }
  });
});

const today = "2026-10-29";
const ready: Pick<TrainingState, "lastLoginDate" | "planFocus" | "planFocusWeek" | "planGeneratedDate"> = {
  lastLoginDate: today,
  planFocus: "lean",
  planFocusWeek: "2026-10-26",
};

describe("planGenerationSkip", () => {
  it("allows generation when the day has rolled over and the focus is this week's", () => {
    expect(planGenerationSkip(ready, "lean", today)).toBeNull();
  });

  it("does not generate before the day has rolled over", () => {
    expect(planGenerationSkip({ ...ready, lastLoginDate: "2026-10-28" }, "lean", today)).toBe("not-rolled-over");
    expect(planGenerationSkip({ ...ready, lastLoginDate: "" }, "lean", today)).toBe("not-rolled-over");
  });

  it("does not generate without a focus, or with a focus from another week", () => {
    expect(planGenerationSkip({ ...ready, planFocus: undefined }, "lean", today)).toBe("no-focus");
    expect(planGenerationSkip({ ...ready, planFocusWeek: "2026-10-19" }, "lean", today)).toBe("stale-focus-week");
    expect(planGenerationSkip({ ...ready, planFocusWeek: undefined }, "lean", today)).toBe("stale-focus-week");
  });

  it("does not generate twice in a day, and abandons a call built for another focus", () => {
    expect(planGenerationSkip({ ...ready, planGeneratedDate: today }, "lean", today)).toBe("already-generated");
    expect(planGenerationSkip(ready, "bounce", today)).toBe("focus-mismatch");
  });

  it("checks in the documented order", () => {
    const everythingWrong = { lastLoginDate: "x", planFocus: "lean" as const, planFocusWeek: "y", planGeneratedDate: today };
    expect(planGenerationSkip(everythingWrong, "bounce", today)).toBe("not-rolled-over");
    expect(planGenerationSkip({ ...everythingWrong, lastLoginDate: today }, "bounce", today)).toBe("stale-focus-week");
    expect(planGenerationSkip({ ...everythingWrong, lastLoginDate: today, planFocusWeek: "2026-10-26" }, "bounce", today)).toBe(
      "already-generated",
    );
  });
});

describe("plan candidates", () => {
  const manual: TrainingTask = { id: "m", text: "mine", source: "manual", completed: false, createdAt: "t" };

  it("leaves out entries that are already on the list, and repeats inside one call", () => {
    const present: TrainingTask = { ...manual, id: "p", source: "plan", planEntryId: "jd_tech_mon.1" };
    const kept = filterNewPlanCandidates(
      [manual, present],
      [
        { planEntryId: "jd_tech_mon.1", text: "a" },
        { planEntryId: "jd_tech_mon.2", text: "b" },
        { planEntryId: "jd_tech_mon.2", text: "b again" },
      ],
    );
    expect(kept.map((candidate) => candidate.planEntryId)).toEqual(["jd_tech_mon.2"]);
  });

  it("builds an open plan task that keeps its entry id", () => {
    const task = buildTaskFromPlanCandidate(
      { planEntryId: "jd_tech_mon.2", text: "干地滑行姿势", target: "6组20秒", description: "冰前" },
      new Set(),
      "2026-10-29T00:00:00.000Z",
    );
    expect(task).toMatchObject({
      text: "干地滑行姿势",
      target: "6组20秒",
      description: "冰前",
      source: "plan",
      planEntryId: "jd_tech_mon.2",
      completed: false,
    });
    expect(task.id).toMatch(/^task_/);
  });
});

describe("the plan fields survive the read normalizers", () => {
  it("normalizeTask keeps planEntryId and source", () => {
    const task = normalizeTask({ id: "a", text: "t", source: "plan", planEntryId: "jd_tech_mon.1", completed: false, createdAt: "t" });
    expect(task).toMatchObject({ source: "plan", planEntryId: "jd_tech_mon.1" });
  });

  it("normalizeTrainingState keeps the three plan fields and drops an unknown focus", () => {
    const kept = normalizeTrainingState({
      planFocus: "bounce",
      planFocusWeek: "2026-10-26",
      planGeneratedDate: "2026-10-29",
    } as Partial<TrainingState>);
    expect(kept).toMatchObject({ planFocus: "bounce", planFocusWeek: "2026-10-26", planGeneratedDate: "2026-10-29" });

    const bad = normalizeTrainingState({ planFocus: "sprint" } as unknown as Partial<TrainingState>);
    expect(bad.planFocus).toBeUndefined();
    expect("planFocus" in normalizeTrainingState({})).toBe(false);
  });
});
