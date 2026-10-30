import type { DateString, TrainingPlanFocus, TrainingState, TrainingTask } from "@skatingx/schema";

import { todayDateString } from "../dates";
import { createTaskId } from "../tasks";

/**
 * Plan template tasks (ADR-008). The template day is cut into entries on the client; one entry that
 * is generated becomes one `TrainingTask` with `source: "plan"`. The rules here are pure so the
 * transaction in firebase-client only has to apply them.
 */

export type PlanTaskCandidate = {
  /** Stable, language-independent entry id such as `jd_tech_mon.1`. */
  planEntryId: string;
  text: string;
  target?: string;
  description?: string;
};

const WEEKDAY_SUFFIX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const FOCUS_PREFIX: Record<TrainingPlanFocus, string> = {
  lean: "jd_tech",
  bounce: "jd_speed",
  endurance: "jd_race",
};

function parseLocalDate(dateId: DateString): Date {
  const [year = 0, month = 1, day = 1] = dateId.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The Monday of the week that holds `dateId`, as a local date. Weeks run Monday to Sunday, so a Sunday belongs to the week that began six days earlier. */
export function mondayOfWeek(dateId: DateString): DateString {
  const date = parseLocalDate(dateId);
  const sinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - sinceMonday);
  return todayDateString(date);
}

/** The template day id (`jd_tech_mon`) that a focus lays on the weekday of `dateId`. */
export function planDayIdFor(focus: TrainingPlanFocus, dateId: DateString): string {
  return `${FOCUS_PREFIX[focus]}_${WEEKDAY_SUFFIX[parseLocalDate(dateId).getDay()]}`;
}

export type PlanGenerationSkip =
  | "not-rolled-over"
  | "no-focus"
  | "stale-focus-week"
  | "already-generated"
  | "focus-mismatch";

/**
 * Whether plan tasks may be generated now. The order is the order of ADR-008 §2.4: a day that has not
 * rolled over yet must not be generated into, because the new tasks would be archived as yesterday's.
 */
export function planGenerationSkip(
  state: Pick<TrainingState, "lastLoginDate" | "planFocus" | "planFocusWeek" | "planGeneratedDate">,
  focus: TrainingPlanFocus,
  today: DateString,
): PlanGenerationSkip | null {
  if (state.lastLoginDate !== today) return "not-rolled-over";
  if (!state.planFocus) return "no-focus";
  if (state.planFocusWeek !== mondayOfWeek(today)) return "stale-focus-week";
  if (state.planGeneratedDate === today) return "already-generated";
  if (state.planFocus !== focus) return "focus-mismatch";
  return null;
}

/** Candidates whose entry is not already on the list. A deleted task is kept out by the date marker, not here. */
export function filterNewPlanCandidates(
  todayTasks: readonly TrainingTask[],
  candidates: readonly PlanTaskCandidate[],
): PlanTaskCandidate[] {
  const present = new Set(todayTasks.flatMap((task) => (task.planEntryId ? [task.planEntryId] : [])));
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (present.has(candidate.planEntryId) || seen.has(candidate.planEntryId)) return false;
    seen.add(candidate.planEntryId);
    return true;
  });
}

export function buildTaskFromPlanCandidate(
  candidate: PlanTaskCandidate,
  existingIds: Set<string>,
  nowIso: string,
): TrainingTask {
  return {
    id: createTaskId(existingIds),
    text: candidate.text,
    ...(candidate.target ? { target: candidate.target } : {}),
    ...(candidate.description ? { description: candidate.description } : {}),
    source: "plan",
    planEntryId: candidate.planEntryId,
    completed: false,
    createdAt: nowIso,
  };
}
