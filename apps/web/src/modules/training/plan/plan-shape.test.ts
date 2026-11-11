import type { WeekdayKey } from "@skatingx/content";
import { PLAN_FOCUSES, type PlanFocus } from "@skatingx/skating-domain";
import { describe, expect, it } from "vitest";

import { PLAN_DAY_COPY } from "./plan-day-copy";
import { PLAN_DAY_ENTRIES, type PlanEntrySurface } from "./plan-day-entries";
import { PLAN_FOCUS_SHAPE, type PlanShapeSurface } from "./plan-shape";

const WEEKDAY_SUFFIX: Record<WeekdayKey, string> = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
};

const FOCUS_PREFIX: Record<PlanFocus, string> = {
  lean: "jd_tech",
  bounce: "jd_speed",
  endurance: "jd_race",
};

/** Same rule the table was copied from: an on-ice entry wins, all recovery stays recovery, else land. */
function surfaceOf(surfaces: readonly PlanEntrySurface[]): PlanShapeSurface {
  if (surfaces.some((surface) => surface === "on-ice")) return "on-ice";
  if (surfaces.every((surface) => surface === "recovery")) return "recovery";
  return "land";
}

describe("plan focus shape", () => {
  it("pins all 21 cells to the copied intensity and surface", () => {
    expect(PLAN_FOCUS_SHAPE).toEqual({
      lean: {
        monday: { surface: "on-ice", intensity: "plan.intensity.mid" },
        tuesday: { surface: "land", intensity: "plan.intensity.mid" },
        wednesday: { surface: "on-ice", intensity: "plan.intensity.mid" },
        thursday: { surface: "recovery", intensity: "plan.intensity.low" },
        friday: { surface: "on-ice", intensity: "plan.intensity.mid" },
        saturday: { surface: "on-ice", intensity: "plan.intensity.mid" },
        sunday: { surface: "recovery", intensity: "plan.intensity.low" },
      },
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
    });
  });

  it("matches a fresh read of the old day entries and day copy", () => {
    const derived = Object.fromEntries(
      PLAN_FOCUSES.map((focus) => [
        focus,
        Object.fromEntries(
          (Object.keys(WEEKDAY_SUFFIX) as WeekdayKey[]).map((weekday) => {
            const id = `${FOCUS_PREFIX[focus]}_${WEEKDAY_SUFFIX[weekday]}`;
            const entries = PLAN_DAY_ENTRIES[id] ?? [];
            return [
              weekday,
              {
                surface: surfaceOf(entries.map((entry) => entry.surface)),
                intensity: PLAN_DAY_COPY[id]?.intensity,
              },
            ];
          }),
        ),
      ]),
    );
    expect(PLAN_FOCUS_SHAPE).toEqual(derived);
  });
});
