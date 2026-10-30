import type { DateString, TrainingState, TrainingTask } from "@skatingx/schema";

import { todayDateString } from "../dates";

/**
 * How far a plan day got, derived from tasks (ADR-008 step 2). The plan page used to keep its own
 * check-ins; now the tasks are the single record, so the page only reads them. Pure so the four
 * ways a day can look (nothing, some, all, cleared) are tested without a page.
 */

const WEEKDAY_OFFSET = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 } as const;

type Weekday = keyof typeof WEEKDAY_OFFSET;

function parseLocalDate(dateId: DateString): Date {
  const [year = 0, month = 1, day = 1] = dateId.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** `dateId` moved by whole days, as a local date. */
export function addDaysToDateString(dateId: DateString, days: number): DateString {
  const date = parseLocalDate(dateId);
  date.setDate(date.getDate() + days);
  return todayDateString(date);
}

/** The calendar day a template day (`jd_tech_wed`) falls on in the week that starts on `monday`. */
export function planDayDate(monday: DateString, dayId: string): DateString {
  const suffix = dayId.slice(dayId.lastIndexOf("_") + 1);
  if (!Object.hasOwn(WEEKDAY_OFFSET, suffix)) throw new Error(`unknown-plan-day:${dayId}`);
  return addDaysToDateString(monday, WEEKDAY_OFFSET[suffix as Weekday]);
}

/** What a task needs to be counted: where it came from and whether it is done. */
export type ProgressTask = Pick<TrainingTask, "completed" | "source">;

export type PlanDayProgress =
  /** Later than today: only the schedule is shown. */
  | { kind: "future" }
  /** The template lays no tasks on this day. */
  | { kind: "rest" }
  /** Today, and no plan task has been generated yet. */
  | { kind: "not-generated" }
  /** Today, generated, and every plan task has since been deleted. */
  | { kind: "cleared" }
  /** A past day with no archive document: nothing was recorded, which is not the same as not done. */
  | { kind: "no-record" }
  /** A past day that was archived, with no plan task in it. */
  | { kind: "no-plan-tasks" }
  | { kind: "progress"; done: number; total: number; complete: boolean };

export type PlanProgressInput = {
  date: DateString;
  today: DateString;
  /** False for a rest day (every entry of the template day is marked not to generate). */
  generates: boolean;
  state: Pick<TrainingState, "lastLoginDate" | "planGeneratedDate" | "todayTasks">;
  /** Archived tasks by day, from `taskHistory`. A day with no document is absent. */
  archive: ReadonlyMap<DateString, readonly ProgressTask[]>;
};

function count(tasks: readonly ProgressTask[]): PlanDayProgress | null {
  const plan = tasks.filter((task) => task.source === "plan");
  if (plan.length === 0) return null;
  const done = plan.filter((task) => task.completed).length;
  return { kind: "progress", done, total: plan.length, complete: done === plan.length };
}

export function planDayProgress(input: PlanProgressInput): PlanDayProgress {
  const { date, today, generates, state, archive } = input;
  if (date > today) return { kind: "future" };
  if (!generates) return { kind: "rest" };

  if (date === today) {
    // Before the rollover, `todayTasks` still holds yesterday's list. It is not today's.
    if (state.lastLoginDate !== today) return { kind: "not-generated" };
    const progress = count(state.todayTasks);
    if (progress) return progress;
    return state.planGeneratedDate === today ? { kind: "cleared" } : { kind: "not-generated" };
  }

  const archived = archive.get(date);
  if (!archived) return { kind: "no-record" };
  return count(archived) ?? { kind: "no-plan-tasks" };
}
