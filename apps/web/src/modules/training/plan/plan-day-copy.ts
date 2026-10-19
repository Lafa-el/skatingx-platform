import type { PlanMessageKey } from "@/shared/i18n/plan-messages";

type DayCopy = {
  readonly when: PlanMessageKey;
  readonly kind: PlanMessageKey;
  readonly intensity: PlanMessageKey;
  readonly body: PlanMessageKey;
};

export const PLAN_DAY_COPY: Record<string, DayCopy> = {
  jd_tech_mon: { when: "plan.lean.mon.when", kind: "plan.lean.mon.kind", intensity: "plan.intensity.mid", body: "plan.lean.mon.body" },
  jd_tech_tue: { when: "plan.lean.tue.when", kind: "plan.lean.tue.kind", intensity: "plan.intensity.mid", body: "plan.lean.tue.body" },
  jd_tech_wed: { when: "plan.lean.wed.when", kind: "plan.lean.wed.kind", intensity: "plan.intensity.mid", body: "plan.lean.wed.body" },
  jd_tech_thu: { when: "plan.lean.thu.when", kind: "plan.lean.thu.kind", intensity: "plan.intensity.low", body: "plan.lean.thu.body" },
  jd_tech_fri: { when: "plan.lean.fri.when", kind: "plan.lean.fri.kind", intensity: "plan.intensity.mid", body: "plan.lean.fri.body" },
  jd_tech_sat: { when: "plan.lean.sat.when", kind: "plan.lean.sat.kind", intensity: "plan.intensity.mid", body: "plan.lean.sat.body" },
  jd_tech_sun: { when: "plan.lean.sun.when", kind: "plan.lean.sun.kind", intensity: "plan.intensity.low", body: "plan.lean.sun.body" },
  jd_speed_mon: { when: "plan.bounce.mon.when", kind: "plan.bounce.mon.kind", intensity: "plan.intensity.midHigh", body: "plan.bounce.mon.body" },
  jd_speed_tue: { when: "plan.bounce.tue.when", kind: "plan.bounce.tue.kind", intensity: "plan.intensity.mid", body: "plan.bounce.tue.body" },
  jd_speed_wed: { when: "plan.bounce.wed.when", kind: "plan.bounce.wed.kind", intensity: "plan.intensity.mid", body: "plan.bounce.wed.body" },
  jd_speed_thu: { when: "plan.bounce.thu.when", kind: "plan.bounce.thu.kind", intensity: "plan.intensity.low", body: "plan.bounce.thu.body" },
  jd_speed_fri: { when: "plan.bounce.fri.when", kind: "plan.bounce.fri.kind", intensity: "plan.intensity.mid", body: "plan.bounce.fri.body" },
  jd_speed_sat: { when: "plan.bounce.sat.when", kind: "plan.bounce.sat.kind", intensity: "plan.intensity.midHigh", body: "plan.bounce.sat.body" },
  jd_speed_sun: { when: "plan.bounce.sun.when", kind: "plan.bounce.sun.kind", intensity: "plan.intensity.low", body: "plan.bounce.sun.body" },
  jd_race_mon: { when: "plan.endurance.mon.when", kind: "plan.endurance.mon.kind", intensity: "plan.intensity.mid", body: "plan.endurance.mon.body" },
  jd_race_tue: { when: "plan.endurance.tue.when", kind: "plan.endurance.tue.kind", intensity: "plan.intensity.low", body: "plan.endurance.tue.body" },
  jd_race_wed: { when: "plan.endurance.wed.when", kind: "plan.endurance.wed.kind", intensity: "plan.intensity.mid", body: "plan.endurance.wed.body" },
  jd_race_thu: { when: "plan.endurance.thu.when", kind: "plan.endurance.thu.kind", intensity: "plan.intensity.low", body: "plan.endurance.thu.body" },
  jd_race_fri: { when: "plan.endurance.fri.when", kind: "plan.endurance.fri.kind", intensity: "plan.intensity.lowMid", body: "plan.endurance.fri.body" },
  jd_race_sat: { when: "plan.endurance.sat.when", kind: "plan.endurance.sat.kind", intensity: "plan.intensity.variable", body: "plan.endurance.sat.body" },
  jd_race_sun: { when: "plan.endurance.sun.when", kind: "plan.endurance.sun.kind", intensity: "plan.intensity.low", body: "plan.endurance.sun.body" },
};

export function dayCopy(taskId: string): DayCopy {
  const copy = PLAN_DAY_COPY[taskId];
  if (!copy) {
    throw new Error("unknown-plan-day");
  }
  return copy;
}
