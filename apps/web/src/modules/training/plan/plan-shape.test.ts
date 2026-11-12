import { PLAN_FOCUSES } from "@skatingx/skating-domain";
import { describe, expect, it } from "vitest";

import { PLAN_FOCUS_SHAPE } from "./plan-shape";

describe("plan focus shape", () => {
  it("pins all 21 cells to the copied intensity and surface", () => {
    expect(PLAN_FOCUS_SHAPE).toEqual({
      lean: {
        monday: { surface: "on-ice", intensity: "plan.intensity.mid" },
        tuesday: { surface: "land", intensity: "plan.intensity.mid" },
        wednesday: { surface: "recovery", intensity: "plan.intensity.mid" },
        thursday: { surface: "on-ice", intensity: "plan.intensity.mid" },
        friday: { surface: "on-ice", intensity: "plan.intensity.mid" },
        saturday: { surface: "on-ice", intensity: "plan.intensity.mid" },
        sunday: { surface: "recovery", intensity: "plan.intensity.low" },
      },
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
    });
  });

  it("corrects Wednesday and Thursday to follow the 11-13 routine", () => {
    // Wednesday is that stage's active recovery day, so the card is shown and no tasks are generated.
    // Thursday is the 100-minute specific endurance day, so it generates on ice at mid rather than the old recovery low.
    for (const focus of PLAN_FOCUSES) {
      expect(PLAN_FOCUS_SHAPE[focus].wednesday).toEqual({ surface: "recovery", intensity: "plan.intensity.mid" });
      expect(PLAN_FOCUS_SHAPE[focus].thursday).toEqual({ surface: "on-ice", intensity: "plan.intensity.mid" });
    }
  });
});
