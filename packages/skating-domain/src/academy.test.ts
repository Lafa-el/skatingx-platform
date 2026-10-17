import { ACADEMY_STAGES } from "@skatingx/content";
import { describe, expect, it } from "vitest";

import { buildAcademyImportCandidate, matchRoutineTaskLabel } from "./academy";

const item = ACADEMY_STAGES[0]!.modules[0]!.items[0]!;

describe("buildAcademyImportCandidate", () => {
  it("writes the task in one language: title, target, description and tags together", () => {
    expect(buildAcademyImportCandidate(item, "zh")).toEqual({
      academyItemId: item.id,
      text: item.titleZh,
      target: item.targetZh,
      description: item.descriptionZh,
      tags: item.tagsZh,
    });
    expect(buildAcademyImportCandidate(item, "en")).toEqual({
      academyItemId: item.id,
      text: item.titleEn,
      target: item.targetEn,
      description: item.descriptionEn,
      tags: item.tagsEn,
    });
  });

  it("the id does not depend on the language", () => {
    expect(buildAcademyImportCandidate(item, "en").academyItemId).toBe(
      buildAcademyImportCandidate(item, "zh").academyItemId,
    );
  });
});

/**
 * Which drill each of the 63 weekly-plan labels is matched to, as it was when the Academy content
 * was first extracted from the legacy app (key: day plan id and position). Importing a weekday
 * routine depends on this, so a change to the Chinese text (for example its punctuation) must not
 * move any label to another drill.
 */
const ROUTINE_MATCHES: Record<string, string> = {
  "age4_6-wp-0#0": "age4_6-m0-i0",
  "age4_6-wp-0#1": "age4_6-m1-i0",
  "age4_6-wp-0#2": "age4_6-m2-i0",
  "age4_6-wp-0#3": "age4_6-m3-i0",
  "age4_6-wp-1#0": "age4_6-m0-i1",
  "age4_6-wp-1#1": "age4_6-m1-i3",
  "age4_6-wp-1#2": "age4_6-m2-i1",
  "age4_6-wp-1#3": "age4_6-m3-i2",
  "age4_6-wp-2#0": "age4_6-m0-i2",
  "age4_6-wp-2#1": "age4_6-m1-i4",
  "age4_6-wp-2#2": "age4_6-m2-i3",
  "age4_6-wp-2#3": "age4_6-m0-i3",
  "age7_10-wp-0#0": "age7_10-m0-i0",
  "age7_10-wp-0#1": "age7_10-m0-i2",
  "age7_10-wp-0#2": "age7_10-m0-i4",
  "age7_10-wp-0#3": "age7_10-m0-i6",
  "age7_10-wp-0#4": "age7_10-m2-i0",
  "age7_10-wp-1#0": "age7_10-m1-i5",
  "age7_10-wp-1#1": "age7_10-m1-i0",
  "age7_10-wp-1#2": "age7_10-m1-i1",
  "age7_10-wp-1#3": "age7_10-m1-i3",
  "age7_10-wp-1#4": "age7_10-m1-i6",
  "age7_10-wp-2#0": "age7_10-m1-i2",
  "age7_10-wp-2#1": "age7_10-m1-i4",
  "age7_10-wp-2#2": "age7_10-m3-i0",
  "age7_10-wp-2#3": "age7_10-m3-i1",
  "age7_10-wp-2#4": "age7_10-m3-i2",
  "age7_10-wp-3#0": "age7_10-m4-i0",
  "age7_10-wp-3#1": "age7_10-m2-i2",
  "age7_10-wp-3#2": "age7_10-m2-i1",
  "age7_10-wp-3#3": "age7_10-m0-i1",
  "age7_10-wp-4#0": "age7_10-m4-i1",
  "age7_10-wp-4#1": "age7_10-m4-i2",
  "age7_10-wp-4#2": "age7_10-m0-i3",
  "age7_10-wp-4#3": "age7_10-m0-i5",
  "age11_16-wp-0#0": "age11_16-m0-i0",
  "age11_16-wp-0#1": "age11_16-m0-i3",
  "age11_16-wp-0#2": "age11_16-m0-i2",
  "age11_16-wp-0#3": "age11_16-m0-i5",
  "age11_16-wp-0#4": "age11_16-m3-i0",
  "age11_16-wp-1#0": "age11_16-m1-i0",
  "age11_16-wp-1#1": "age11_16-m1-i5",
  "age11_16-wp-1#2": "age11_16-m1-i3",
  "age11_16-wp-1#3": "age11_16-m1-i2",
  "age11_16-wp-1#4": "age11_16-m1-i4",
  "age11_16-wp-2#0": "age11_16-m4-i3",
  "age11_16-wp-2#1": "age11_16-m4-i4",
  "age11_16-wp-2#2": "age11_16-m4-i1",
  "age11_16-wp-2#3": "age11_16-m4-i0",
  "age11_16-wp-3#0": "age11_16-m2-i0",
  "age11_16-wp-3#1": "age11_16-m2-i1",
  "age11_16-wp-3#2": "age11_16-m0-i0",
  "age11_16-wp-3#3": "age11_16-m3-i1",
  "age11_16-wp-4#0": "age11_16-m2-i2",
  "age11_16-wp-4#1": "age11_16-m0-i1",
  "age11_16-wp-4#2": "age11_16-m1-i0",
  "age11_16-wp-4#3": "age11_16-m3-i2",
  "age11_16-wp-5#0": "age11_16-m2-i3",
  "age11_16-wp-5#1": "age11_16-m0-i0",
  "age11_16-wp-5#2": "age11_16-m1-i5",
  "age11_16-wp-6#0": "age11_16-m4-i1",
  "age11_16-wp-6#1": "age11_16-m4-i1",
  "age11_16-wp-6#2": "age11_16-m4-i5",
};

describe("matchRoutineTaskLabel: the weekly-plan labels keep their drills", () => {
  it("every label is matched to the same drill as before", () => {
    const now: Record<string, string | null> = {};
    for (const stage of ACADEMY_STAGES) {
      for (const plan of stage.weeklyRoutine.dayPlans) {
        plan.taskLabelsZh.forEach((label, i) => {
          now[`${plan.id}#${i}`] = matchRoutineTaskLabel(stage, label)?.id ?? null;
        });
      }
    }
    expect(Object.keys(now)).toHaveLength(63);
    expect(now).toEqual(ROUTINE_MATCHES);
  });
});
