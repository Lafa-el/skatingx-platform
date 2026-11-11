import { ACADEMY_STAGES, flattenStageItems } from "@skatingx/content";
import { describe, expect, it } from "vitest";

import { matchRoutineTaskLabel } from "./academy";
import {
  ROUTINE_MODULE_LINKS,
  resolveRoutineModuleLink,
  routineItemIdForDayPlanTask,
} from "./routine-module-links";

const EXPECTED_COUNTS: Record<string, number> = {
  age4_7: 15,
  age8_10: 20,
  age11_13: 34,
  age14_16: 8,
  age17_18: 0,
};

describe("ROUTINE_MODULE_LINKS", () => {
  it("has a reviewed link for every routine item, 15/20/34/8/0", () => {
    const counts: Record<string, number> = {};
    for (const stage of ACADEMY_STAGES) {
      const ids = new Set<string>();
      stage.weeklyRoutine.dayPlans.forEach((plan, planIndex) => {
        plan.taskLabelsZh.forEach((_, taskIndex) => {
          ids.add(`${stage.id}-w${planIndex}-t${taskIndex}`);
        });
      });
      for (const day of Object.values(stage.weeklyRoutine.days)) {
        for (const item of day) ids.add(item.routineItemId);
      }
      for (const routineItemId of ids) {
        expect(resolveRoutineModuleLink(routineItemId), routineItemId).toBeTruthy();
      }
      counts[stage.id] = ids.size;
    }
    expect(counts).toEqual(EXPECTED_COUNTS);
    expect(Object.keys(ROUTINE_MODULE_LINKS)).toHaveLength(77);
  });

  it("each value is a drill that exists in the same stage", () => {
    for (const [routineItemId, academyItemId] of Object.entries(ROUTINE_MODULE_LINKS)) {
      const stageId = routineItemId.slice(0, routineItemId.lastIndexOf("-w"));
      const stage = ACADEMY_STAGES.find((entry) => entry.id === stageId);
      expect(stage, routineItemId).toBeTruthy();
      expect(academyItemId.startsWith(`${stageId}-`)).toBe(true);
      expect(flattenStageItems(stage!).some((item) => item.id === academyItemId)).toBe(true);
    }
  });

  it("agrees with matchRoutineTaskLabel on all 77 labels", () => {
    let seen = 0;
    for (const stage of ACADEMY_STAGES) {
      for (const plan of stage.weeklyRoutine.dayPlans) {
        plan.taskLabelsZh.forEach((label, taskIndex) => {
          const routineItemId = routineItemIdForDayPlanTask(stage.id, plan.id, taskIndex);
          expect(routineItemId).not.toBeNull();
          expect(resolveRoutineModuleLink(routineItemId!)).toBe(matchRoutineTaskLabel(stage, label)?.id);
          seen += 1;
        });
      }
    }
    expect(seen).toBe(77);
  });

  it("parses a real day-plan id and rejects one that is not that shape", () => {
    expect(routineItemIdForDayPlanTask("age11_13", "age11_13-wp-6", 2)).toBe("age11_13-w6-t2");
    expect(routineItemIdForDayPlanTask("age4_7", "not-a-plan", 0)).toBeNull();
    expect(routineItemIdForDayPlanTask("age4_7", "age8_10-wp-0", 0)).toBeNull();
    expect(routineItemIdForDayPlanTask("age4_7", "age4_7-wp-", 0)).toBeNull();
  });
});
