/**
 * The 21 day cards are retired. These 21 ids stay so the points history can
 * resolve a stored `plan-checkin` refId. Points are no longer awarded from here (ADR-008).
 */

export const PLAN_FOCUSES = ["lean", "bounce", "endurance"] as const;

export type PlanFocus = (typeof PLAN_FOCUSES)[number];

export const PLAN_WEEK_NUMBER = 1;

export type PlanDayTemplate = {
  readonly id: string;
  readonly focus: PlanFocus;
};

export const PLAN_DAYS: readonly PlanDayTemplate[] = [
  { id: "jd_tech_mon", focus: "lean" },
  { id: "jd_tech_tue", focus: "lean" },
  { id: "jd_tech_wed", focus: "lean" },
  { id: "jd_tech_thu", focus: "lean" },
  { id: "jd_tech_fri", focus: "lean" },
  { id: "jd_tech_sat", focus: "lean" },
  { id: "jd_tech_sun", focus: "lean" },
  { id: "jd_speed_mon", focus: "bounce" },
  { id: "jd_speed_tue", focus: "bounce" },
  { id: "jd_speed_wed", focus: "bounce" },
  { id: "jd_speed_thu", focus: "bounce" },
  { id: "jd_speed_fri", focus: "bounce" },
  { id: "jd_speed_sat", focus: "bounce" },
  { id: "jd_speed_sun", focus: "bounce" },
  { id: "jd_race_mon", focus: "endurance" },
  { id: "jd_race_tue", focus: "endurance" },
  { id: "jd_race_wed", focus: "endurance" },
  { id: "jd_race_thu", focus: "endurance" },
  { id: "jd_race_fri", focus: "endurance" },
  { id: "jd_race_sat", focus: "endurance" },
  { id: "jd_race_sun", focus: "endurance" },
];

export function planDayById(taskId: string): PlanDayTemplate | undefined {
  return PLAN_DAYS.find((day) => day.id === taskId);
}
