import type { WeekdayKey } from "@skatingx/content";
import type { PlanFocus } from "@skatingx/skating-domain";

import type { PlanMessageKey } from "@/shared/i18n/plan-messages";

/**
 * The week skeleton copied off the Junior D template.
 * Intensity is the old `PLAN_DAY_COPY` value for that focus and weekday.
 * Surface is read off `PLAN_DAY_ENTRIES`: any on-ice entry wins, an all-recovery day is recovery,
 * and everything else is land. All three focuses share the same surfaces.
 * Wednesday and Thursday are corrected to follow the routine, and are no longer a pure copy of that
 * table: Wednesday is this stage's active recovery day, and Thursday is the specific endurance day.
 */
export type PlanShapeSurface = "on-ice" | "land" | "recovery";

export type PlanDayShape = {
  readonly surface: PlanShapeSurface;
  readonly intensity: PlanMessageKey;
};

/** Surface words stored on a generated task. `off-ice` stays for tasks already written by the old template. */
export const PLAN_SURFACE_LABEL = {
  "off-ice": "plan.surface.offIce",
  "on-ice": "plan.surface.onIce",
  land: "plan.surface.land",
  recovery: "plan.surface.recovery",
} as const satisfies Record<string, PlanMessageKey>;

const LEAN_WEEK: Record<WeekdayKey, PlanDayShape> = {
  monday: { surface: "on-ice", intensity: "plan.intensity.mid" },
  tuesday: { surface: "land", intensity: "plan.intensity.mid" },
  wednesday: { surface: "recovery", intensity: "plan.intensity.mid" },
  thursday: { surface: "on-ice", intensity: "plan.intensity.mid" },
  friday: { surface: "on-ice", intensity: "plan.intensity.mid" },
  saturday: { surface: "on-ice", intensity: "plan.intensity.mid" },
  sunday: { surface: "recovery", intensity: "plan.intensity.low" },
};

export const PLAN_FOCUS_SHAPE: Record<PlanFocus, Record<WeekdayKey, PlanDayShape>> = {
  lean: LEAN_WEEK,
  bounce: {
    monday: { surface: "on-ice", intensity: "plan.intensity.midHigh" },
    tuesday: { surface: "land", intensity: "plan.intensity.mid" },
    wednesday: { surface: "recovery", intensity: "plan.intensity.mid" },
    thursday: { surface: "on-ice", intensity: "plan.intensity.mid" },
    friday: { surface: "on-ice", intensity: "plan.intensity.mid" },
    saturday: { surface: "on-ice", intensity: "plan.intensity.midHigh" },
    sunday: { surface: "recovery", intensity: "plan.intensity.low" },
  },
  endurance: {
    monday: { surface: "on-ice", intensity: "plan.intensity.mid" },
    tuesday: { surface: "land", intensity: "plan.intensity.low" },
    wednesday: { surface: "recovery", intensity: "plan.intensity.mid" },
    thursday: { surface: "on-ice", intensity: "plan.intensity.mid" },
    friday: { surface: "on-ice", intensity: "plan.intensity.lowMid" },
    saturday: { surface: "on-ice", intensity: "plan.intensity.variable" },
    sunday: { surface: "recovery", intensity: "plan.intensity.low" },
  },
};
