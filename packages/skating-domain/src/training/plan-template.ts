/**
 * Junior D week templates from the legacy planning tab. The 21 day cards stay
 * on the client. A check-in stores only the task id, not this text.
 */

export const PLAN_FOCUSES = ["lean", "bounce", "endurance"] as const;

export type PlanFocus = (typeof PLAN_FOCUSES)[number];

export const PLAN_WEEK_NUMBER = 1;

export type PlanDayTemplate = {
  readonly id: string;
  readonly focus: PlanFocus;
  readonly points: number;
};

export const PLAN_DAYS: readonly PlanDayTemplate[] = [
  { id: "jd_tech_mon", focus: "lean", points: 30 },
  { id: "jd_tech_tue", focus: "lean", points: 20 },
  { id: "jd_tech_wed", focus: "lean", points: 30 },
  { id: "jd_tech_thu", focus: "lean", points: 15 },
  { id: "jd_tech_fri", focus: "lean", points: 30 },
  { id: "jd_tech_sat", focus: "lean", points: 30 },
  { id: "jd_tech_sun", focus: "lean", points: 10 },
  { id: "jd_speed_mon", focus: "bounce", points: 35 },
  { id: "jd_speed_tue", focus: "bounce", points: 20 },
  { id: "jd_speed_wed", focus: "bounce", points: 35 },
  { id: "jd_speed_thu", focus: "bounce", points: 15 },
  { id: "jd_speed_fri", focus: "bounce", points: 30 },
  { id: "jd_speed_sat", focus: "bounce", points: 35 },
  { id: "jd_speed_sun", focus: "bounce", points: 10 },
  { id: "jd_race_mon", focus: "endurance", points: 25 },
  { id: "jd_race_tue", focus: "endurance", points: 15 },
  { id: "jd_race_wed", focus: "endurance", points: 25 },
  { id: "jd_race_thu", focus: "endurance", points: 10 },
  { id: "jd_race_fri", focus: "endurance", points: 20 },
  { id: "jd_race_sat", focus: "endurance", points: 25 },
  { id: "jd_race_sun", focus: "endurance", points: 10 },
];

export function planDays(focus: PlanFocus): readonly PlanDayTemplate[] {
  return PLAN_DAYS.filter((day) => day.focus === focus);
}

export function planDayById(taskId: string): PlanDayTemplate | undefined {
  return PLAN_DAYS.find((day) => day.id === taskId);
}

/** Points already checked for the selected focus. Other focuses do not add in. */
export function weeklyCheckedPoints(focus: PlanFocus, completedIds: ReadonlySet<string>): number {
  return planDays(focus).reduce((sum, day) => (completedIds.has(day.id) ? sum + day.points : sum), 0);
}

/**
 * Official balance after one check-in. A task that is already stored does not
 * add points again. Streak and completed days are left to the training tasks.
 */
export function applyPlanCheckIn(balance: number, award: number, alreadyChecked: boolean): number {
  if (alreadyChecked) return balance;
  return balance + award;
}
