import type { TrainingTask } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import {
  addDaysToDateString,
  planDayDate,
  planDayProgress,
  type PlanProgressInput,
  type ProgressTask,
} from "./plan-progress";

// 2026-10-28 is a Wednesday; the week starts on Monday 2026-10-26.
const MONDAY = "2026-10-26";
const TODAY = "2026-10-28";

const plan = (completed: boolean): ProgressTask => ({ completed, source: "plan" });
const manual = (completed: boolean): ProgressTask => ({ completed, source: "manual" });
const academy = (completed: boolean): ProgressTask => ({ completed, source: "academy" });
const noSource = (completed: boolean): ProgressTask => ({ completed });

function input(over: {
  date?: string;
  generates?: boolean;
  lastLoginDate?: string;
  planGeneratedDate?: string;
  todayTasks?: readonly ProgressTask[];
  archive?: Record<string, readonly ProgressTask[]>;
}): PlanProgressInput {
  return {
    date: over.date ?? TODAY,
    today: TODAY,
    generates: over.generates ?? true,
    state: {
      lastLoginDate: over.lastLoginDate ?? TODAY,
      ...(over.planGeneratedDate ? { planGeneratedDate: over.planGeneratedDate } : {}),
      todayTasks: (over.todayTasks ?? []) as TrainingTask[],
    },
    archive: new Map(Object.entries(over.archive ?? {})),
  };
}

describe("planDayProgress today", () => {
  it("is not generated when there is no plan task and nothing was generated", () => {
    expect(planDayProgress(input({ todayTasks: [manual(false)] }))).toEqual({ kind: "not-generated" });
  });

  it("is not generated when the list is empty and the marker is from an earlier day", () => {
    expect(planDayProgress(input({ planGeneratedDate: "2026-10-27" }))).toEqual({ kind: "not-generated" });
  });

  it("is cleared when it was generated and every plan task is gone", () => {
    expect(planDayProgress(input({ planGeneratedDate: TODAY, todayTasks: [manual(true)] }))).toEqual({
      kind: "cleared",
    });
  });

  it("counts done over total, and only plan tasks", () => {
    const progress = planDayProgress(
      input({
        planGeneratedDate: TODAY,
        todayTasks: [plan(true), plan(false), plan(false), manual(true), academy(true), noSource(true)],
      }),
    );
    expect(progress).toEqual({ kind: "progress", done: 1, total: 3, complete: false });
  });

  it("is complete when every plan task is done, whatever the other tasks are", () => {
    const progress = planDayProgress(
      input({ planGeneratedDate: TODAY, todayTasks: [plan(true), plan(true), manual(false)] }),
    );
    expect(progress).toEqual({ kind: "progress", done: 2, total: 2, complete: true });
  });

  it("follows the list: ticking one more task moves the count", () => {
    const before = planDayProgress(input({ planGeneratedDate: TODAY, todayTasks: [plan(false), plan(false)] }));
    const after = planDayProgress(input({ planGeneratedDate: TODAY, todayTasks: [plan(true), plan(false)] }));
    expect(before).toMatchObject({ done: 0, total: 2 });
    expect(after).toMatchObject({ done: 1, total: 2 });
  });

  it("does not show yesterday's list as today's before the rollover has run", () => {
    expect(
      planDayProgress(input({ lastLoginDate: "2026-10-27", planGeneratedDate: "2026-10-27", todayTasks: [plan(true)] })),
    ).toEqual({ kind: "not-generated" });
  });
});

describe("planDayProgress past days", () => {
  const monday = "2026-10-26";

  it("is no record when the day has no archive document, however the list looks today", () => {
    expect(planDayProgress(input({ date: monday, todayTasks: [plan(true)] }))).toEqual({ kind: "no-record" });
  });

  it("counts the archived plan tasks", () => {
    expect(planDayProgress(input({ date: monday, archive: { [monday]: [plan(true), plan(false), manual(true)] } }))).toEqual(
      { kind: "progress", done: 1, total: 2, complete: false },
    );
  });

  it("is complete when every archived plan task was done", () => {
    expect(planDayProgress(input({ date: monday, archive: { [monday]: [plan(true), manual(false)] } }))).toEqual({
      kind: "progress",
      done: 1,
      total: 1,
      complete: true,
    });
  });

  it("says there were no plan tasks when the archive has only other tasks", () => {
    expect(planDayProgress(input({ date: monday, archive: { [monday]: [manual(true)] } }))).toEqual({
      kind: "no-plan-tasks",
    });
  });

  it("reads each day from its own document", () => {
    const archive = { "2026-10-26": [plan(true)], "2026-10-27": [plan(false)] };
    expect(planDayProgress(input({ date: "2026-10-26", archive }))).toMatchObject({ complete: true });
    expect(planDayProgress(input({ date: "2026-10-27", archive }))).toMatchObject({ complete: false });
  });
});

describe("planDayProgress future and rest days", () => {
  it("shows only the schedule for a later day, even with tasks on today's list", () => {
    expect(planDayProgress(input({ date: "2026-10-29", planGeneratedDate: TODAY, todayTasks: [plan(true)] }))).toEqual({
      kind: "future",
    });
  });

  it("is a rest day, not 'cleared' or 'no record', when the template lays no tasks", () => {
    expect(planDayProgress(input({ generates: false, planGeneratedDate: TODAY }))).toEqual({ kind: "rest" });
    expect(planDayProgress(input({ date: "2026-10-26", generates: false }))).toEqual({ kind: "rest" });
  });

  it("keeps a later rest day as the schedule only", () => {
    expect(planDayProgress(input({ date: "2026-11-01", generates: false }))).toEqual({ kind: "future" });
  });
});

describe("week dates", () => {
  it("lays the template weekdays on the dates of the week", () => {
    expect(planDayDate(MONDAY, "jd_tech_mon")).toBe("2026-10-26");
    expect(planDayDate(MONDAY, "jd_speed_wed")).toBe("2026-10-28");
    expect(planDayDate(MONDAY, "jd_race_sun")).toBe("2026-11-01");
  });

  it("crosses a month and a year end", () => {
    expect(planDayDate("2026-12-28", "jd_tech_fri")).toBe("2027-01-01");
    expect(addDaysToDateString("2026-02-27", 2)).toBe("2026-03-01");
  });

  it("refuses an id that is not a template day", () => {
    expect(() => planDayDate(MONDAY, "nonsense")).toThrow("unknown-plan-day");
  });
});
