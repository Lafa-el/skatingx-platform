import type { PlanMessageKey } from "@/shared/i18n/plan-messages";

/**
 * The executable breakdown of each plan day (ADR-008). One entry becomes one training task when the
 * day's tasks are generated. The day's own copy (`when`, `kind`, `intensity`, `body`) stays in
 * `plan-day-copy.ts` and is what the plan page shows; entries are only a re-cut of that body, with no
 * new drills and no change in intensity.
 *
 * Entry ids do not depend on the language and are never reused: they are the stored `planEntryId`
 * that keeps a task from being generated twice.
 */
export type PlanEntrySurface = "off-ice" | "on-ice" | "land" | "recovery";

export type PlanDayEntry = {
  readonly id: string;
  readonly surface: PlanEntrySurface;
  readonly nameKey: PlanMessageKey;
  readonly targetKey?: PlanMessageKey;
  /** `false`: shown on the plan page but never turned into a task (rest-day suggestions). */
  readonly generate?: false;
};

export const PLAN_SURFACE_LABEL: Record<PlanEntrySurface, PlanMessageKey> = {
  "off-ice": "plan.surface.offIce",
  "on-ice": "plan.surface.onIce",
  land: "plan.surface.land",
  recovery: "plan.surface.recovery",
};

export const PLAN_DAY_ENTRIES: Record<string, readonly PlanDayEntry[]> = {
  jd_tech_mon: [
    { id: "jd_tech_mon.1", surface: "off-ice", nameKey: "plan.lean.mon.t1.name" },
    { id: "jd_tech_mon.2", surface: "off-ice", nameKey: "plan.lean.mon.t2.name", targetKey: "plan.lean.mon.t2.target" },
    { id: "jd_tech_mon.3", surface: "on-ice", nameKey: "plan.lean.mon.t3.name" },
    { id: "jd_tech_mon.4", surface: "on-ice", nameKey: "plan.lean.mon.t4.name" },
    { id: "jd_tech_mon.5", surface: "on-ice", nameKey: "plan.lean.mon.t5.name", targetKey: "plan.lean.mon.t5.target" },
  ],
  jd_tech_tue: [
    { id: "jd_tech_tue.1", surface: "land", nameKey: "plan.lean.tue.t1.name" },
    { id: "jd_tech_tue.2", surface: "land", nameKey: "plan.lean.tue.t2.name" },
    { id: "jd_tech_tue.3", surface: "land", nameKey: "plan.lean.tue.t3.name" },
    { id: "jd_tech_tue.4", surface: "land", nameKey: "plan.lean.tue.t4.name" },
    { id: "jd_tech_tue.5", surface: "land", nameKey: "plan.lean.tue.t5.name" },
  ],
  jd_tech_wed: [
    { id: "jd_tech_wed.1", surface: "off-ice", nameKey: "plan.lean.wed.t1.name" },
    { id: "jd_tech_wed.2", surface: "on-ice", nameKey: "plan.lean.wed.t2.name" },
    { id: "jd_tech_wed.3", surface: "on-ice", nameKey: "plan.lean.wed.t3.name", targetKey: "plan.lean.wed.t3.target" },
    { id: "jd_tech_wed.4", surface: "on-ice", nameKey: "plan.lean.wed.t4.name", targetKey: "plan.lean.wed.t4.target" },
  ],
  jd_tech_thu: [
    { id: "jd_tech_thu.1", surface: "recovery", nameKey: "plan.lean.thu.t1.name", targetKey: "plan.lean.thu.t1.target" },
    { id: "jd_tech_thu.2", surface: "recovery", nameKey: "plan.lean.thu.t2.name" },
    { id: "jd_tech_thu.3", surface: "recovery", nameKey: "plan.lean.thu.t3.name" },
  ],
  jd_tech_fri: [
    { id: "jd_tech_fri.1", surface: "off-ice", nameKey: "plan.lean.fri.t1.name" },
    { id: "jd_tech_fri.2", surface: "on-ice", nameKey: "plan.lean.fri.t2.name" },
    { id: "jd_tech_fri.3", surface: "on-ice", nameKey: "plan.lean.fri.t3.name" },
    { id: "jd_tech_fri.4", surface: "on-ice", nameKey: "plan.lean.fri.t4.name", targetKey: "plan.lean.fri.t4.target" },
  ],
  jd_tech_sat: [
    { id: "jd_tech_sat.1", surface: "off-ice", nameKey: "plan.lean.sat.t1.name" },
    { id: "jd_tech_sat.2", surface: "on-ice", nameKey: "plan.lean.sat.t2.name" },
    { id: "jd_tech_sat.3", surface: "on-ice", nameKey: "plan.lean.sat.t3.name", targetKey: "plan.lean.sat.t3.target" },
  ],
  jd_tech_sun: [
    { id: "jd_tech_sun.1", surface: "recovery", nameKey: "plan.lean.sun.t1.name", generate: false },
    { id: "jd_tech_sun.2", surface: "recovery", nameKey: "plan.lean.sun.t2.name", generate: false },
    { id: "jd_tech_sun.3", surface: "recovery", nameKey: "plan.lean.sun.t3.name", generate: false },
    { id: "jd_tech_sun.4", surface: "recovery", nameKey: "plan.lean.sun.t4.name", generate: false },
  ],
  jd_speed_mon: [
    { id: "jd_speed_mon.1", surface: "off-ice", nameKey: "plan.bounce.mon.t1.name" },
    { id: "jd_speed_mon.2", surface: "off-ice", nameKey: "plan.bounce.mon.t2.name", targetKey: "plan.bounce.mon.t2.target" },
    { id: "jd_speed_mon.3", surface: "on-ice", nameKey: "plan.bounce.mon.t3.name", targetKey: "plan.bounce.mon.t3.target" },
    { id: "jd_speed_mon.4", surface: "on-ice", nameKey: "plan.bounce.mon.t4.name", targetKey: "plan.bounce.mon.t4.target" },
  ],
  jd_speed_tue: [
    { id: "jd_speed_tue.1", surface: "land", nameKey: "plan.bounce.tue.t1.name" },
    { id: "jd_speed_tue.2", surface: "land", nameKey: "plan.bounce.tue.t2.name" },
    { id: "jd_speed_tue.3", surface: "land", nameKey: "plan.bounce.tue.t3.name" },
    { id: "jd_speed_tue.4", surface: "land", nameKey: "plan.bounce.tue.t4.name" },
  ],
  jd_speed_wed: [
    { id: "jd_speed_wed.1", surface: "off-ice", nameKey: "plan.bounce.wed.t1.name" },
    { id: "jd_speed_wed.2", surface: "on-ice", nameKey: "plan.bounce.wed.t2.name", targetKey: "plan.bounce.wed.t2.target" },
    { id: "jd_speed_wed.3", surface: "on-ice", nameKey: "plan.bounce.wed.t3.name", targetKey: "plan.bounce.wed.t3.target" },
  ],
  jd_speed_thu: [
    { id: "jd_speed_thu.1", surface: "recovery", nameKey: "plan.bounce.thu.t1.name" },
    { id: "jd_speed_thu.2", surface: "recovery", nameKey: "plan.bounce.thu.t2.name" },
    { id: "jd_speed_thu.3", surface: "recovery", nameKey: "plan.bounce.thu.t3.name", generate: false },
  ],
  jd_speed_fri: [
    { id: "jd_speed_fri.1", surface: "off-ice", nameKey: "plan.bounce.fri.t1.name" },
    { id: "jd_speed_fri.2", surface: "on-ice", nameKey: "plan.bounce.fri.t2.name", targetKey: "plan.bounce.fri.t2.target" },
    { id: "jd_speed_fri.3", surface: "on-ice", nameKey: "plan.bounce.fri.t3.name", targetKey: "plan.bounce.fri.t3.target" },
  ],
  jd_speed_sat: [
    { id: "jd_speed_sat.1", surface: "off-ice", nameKey: "plan.bounce.sat.t1.name" },
    { id: "jd_speed_sat.2", surface: "on-ice", nameKey: "plan.bounce.sat.t2.name", targetKey: "plan.bounce.sat.t2.target" },
    { id: "jd_speed_sat.3", surface: "on-ice", nameKey: "plan.bounce.sat.t3.name", targetKey: "plan.bounce.sat.t3.target" },
  ],
  jd_speed_sun: [
    { id: "jd_speed_sun.1", surface: "recovery", nameKey: "plan.bounce.sun.t1.name", generate: false },
    { id: "jd_speed_sun.2", surface: "recovery", nameKey: "plan.bounce.sun.t2.name", generate: false },
    { id: "jd_speed_sun.3", surface: "recovery", nameKey: "plan.bounce.sun.t3.name", generate: false },
    { id: "jd_speed_sun.4", surface: "recovery", nameKey: "plan.bounce.sun.t4.name", generate: false },
  ],
  jd_race_mon: [
    { id: "jd_race_mon.1", surface: "off-ice", nameKey: "plan.endurance.mon.t1.name" },
    { id: "jd_race_mon.2", surface: "on-ice", nameKey: "plan.endurance.mon.t2.name" },
    { id: "jd_race_mon.3", surface: "on-ice", nameKey: "plan.endurance.mon.t3.name", targetKey: "plan.endurance.mon.t3.target" },
    { id: "jd_race_mon.4", surface: "on-ice", nameKey: "plan.endurance.mon.t4.name" },
  ],
  jd_race_tue: [
    { id: "jd_race_tue.1", surface: "land", nameKey: "plan.endurance.tue.t1.name" },
    { id: "jd_race_tue.2", surface: "land", nameKey: "plan.endurance.tue.t2.name" },
    { id: "jd_race_tue.3", surface: "land", nameKey: "plan.endurance.tue.t3.name" },
    { id: "jd_race_tue.4", surface: "land", nameKey: "plan.endurance.tue.t4.name" },
  ],
  jd_race_wed: [
    { id: "jd_race_wed.1", surface: "off-ice", nameKey: "plan.endurance.wed.t1.name" },
    { id: "jd_race_wed.2", surface: "on-ice", nameKey: "plan.endurance.wed.t2.name", targetKey: "plan.endurance.wed.t2.target" },
    { id: "jd_race_wed.3", surface: "on-ice", nameKey: "plan.endurance.wed.t3.name", targetKey: "plan.endurance.wed.t3.target" },
  ],
  jd_race_thu: [
    { id: "jd_race_thu.1", surface: "recovery", nameKey: "plan.endurance.thu.t1.name", targetKey: "plan.endurance.thu.t1.target" },
    { id: "jd_race_thu.2", surface: "recovery", nameKey: "plan.endurance.thu.t2.name" },
    { id: "jd_race_thu.3", surface: "recovery", nameKey: "plan.endurance.thu.t3.name" },
  ],
  jd_race_fri: [
    { id: "jd_race_fri.1", surface: "off-ice", nameKey: "plan.endurance.fri.t1.name" },
    { id: "jd_race_fri.2", surface: "on-ice", nameKey: "plan.endurance.fri.t2.name" },
    { id: "jd_race_fri.3", surface: "on-ice", nameKey: "plan.endurance.fri.t3.name", targetKey: "plan.endurance.fri.t3.target" },
  ],
  jd_race_sat: [
    { id: "jd_race_sat.1", surface: "off-ice", nameKey: "plan.endurance.sat.t1.name" },
    { id: "jd_race_sat.2", surface: "on-ice", nameKey: "plan.endurance.sat.t2.name" },
    { id: "jd_race_sat.3", surface: "on-ice", nameKey: "plan.endurance.sat.t3.name" },
    { id: "jd_race_sat.4", surface: "recovery", nameKey: "plan.endurance.sat.t4.name", targetKey: "plan.endurance.sat.t4.target" },
  ],
  jd_race_sun: [
    { id: "jd_race_sun.1", surface: "recovery", nameKey: "plan.endurance.sun.t1.name", generate: false },
    { id: "jd_race_sun.2", surface: "recovery", nameKey: "plan.endurance.sun.t2.name", generate: false },
    { id: "jd_race_sun.3", surface: "recovery", nameKey: "plan.endurance.sun.t3.name", generate: false },
  ],
};

export function dayEntries(taskId: string): readonly PlanDayEntry[] {
  const entries = PLAN_DAY_ENTRIES[taskId];
  if (!entries) {
    throw new Error("unknown-plan-day");
  }
  return entries;
}
