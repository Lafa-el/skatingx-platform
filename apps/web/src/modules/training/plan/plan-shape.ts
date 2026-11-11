import type { WeekdayKey } from "@skatingx/content";
import type { PlanFocus } from "@skatingx/skating-domain";

import type { PlanMessageKey } from "@/shared/i18n/plan-messages";

/**
 * The week skeleton copied off the Junior D template.
 * Intensity is the old `PLAN_DAY_COPY` value for that focus and weekday.
 * Surface is read off `PLAN_DAY_ENTRIES`: any on-ice entry wins, an all-recovery day is recovery,
 * and everything else is land. All three focuses share the same surfaces.
 */
export type PlanShapeSurface = "on-ice" | "land" | "recovery";

export type PlanDayShape = {
  readonly surface: PlanShapeSurface;
  readonly intensity: PlanMessageKey;
};

const LEAN_WEEK: Record<WeekdayKey, PlanDayShape> = {
  monday: { surface: "on-ice", intensity: "plan.intensity.mid" },
  tuesday: { surface: "land", intensity: "plan.intensity.mid" },
  wednesday: { surface: "on-ice", intensity: "plan.intensity.mid" },
  thursday: { surface: "recovery", intensity: "plan.intensity.low" },
  friday: { surface: "on-ice", intensity: "plan.intensity.mid" },
  saturday: { surface: "on-ice", intensity: "plan.intensity.mid" },
  sunday: { surface: "recovery", intensity: "plan.intensity.low" },
};

export const PLAN_FOCUS_SHAPE: Record<PlanFocus, Record<WeekdayKey, PlanDayShape>> = {
  lean: LEAN_WEEK,
  bounce: {
    monday: { surface: "on-ice", intensity: "plan.intensity.midHigh" },
    tuesday: { surface: "land", intensity: "plan.intensity.mid" },
    wednesday: { surface: "on-ice", intensity: "plan.intensity.mid" },
    thursday: { surface: "recovery", intensity: "plan.intensity.low" },
    friday: { surface: "on-ice", intensity: "plan.intensity.mid" },
    saturday: { surface: "on-ice", intensity: "plan.intensity.midHigh" },
    sunday: { surface: "recovery", intensity: "plan.intensity.low" },
  },
  endurance: {
    monday: { surface: "on-ice", intensity: "plan.intensity.mid" },
    tuesday: { surface: "land", intensity: "plan.intensity.low" },
    wednesday: { surface: "on-ice", intensity: "plan.intensity.mid" },
    thursday: { surface: "recovery", intensity: "plan.intensity.low" },
    friday: { surface: "on-ice", intensity: "plan.intensity.lowMid" },
    saturday: { surface: "on-ice", intensity: "plan.intensity.variable" },
    sunday: { surface: "recovery", intensity: "plan.intensity.low" },
  },
};
