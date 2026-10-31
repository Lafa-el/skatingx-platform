import { ACADEMY_STAGES, type AcademyItem, type AcademyStage } from "@skatingx/content";
import type { TrainingTask } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import {
  buildAcademyImportCandidate,
  filterNewAcademyCandidates,
  matchRoutineTaskLabel,
  type AcademyImportCandidate,
} from "./academy";

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

const candidate = (academyItemId: string): AcademyImportCandidate => ({
  academyItemId,
  text: academyItemId,
  tags: [],
});
const importedToday = (academyItemId: string): TrainingTask => ({
  id: `task-${academyItemId}`,
  text: academyItemId,
  source: "academy",
  academyItemId,
  completed: false,
  createdAt: "2026-10-29T09:00:00.000Z",
});

describe("filterNewAcademyCandidates", () => {
  it("imports a candidate once per batch: the first wins and the repeat counts as skipped", () => {
    const a = candidate("item-a");
    const b = candidate("item-b");
    const repeat = { ...candidate("item-a"), text: "same drill, other label" };
    const result = filterNewAcademyCandidates([], [a, b, repeat]);
    expect(result.toImport).toEqual([a, b]);
    expect(result.skipped).toBe(1);
  });

  it("still skips what was imported today first, and counts it once", () => {
    const result = filterNewAcademyCandidates(
      [importedToday("item-a")],
      [candidate("item-a"), candidate("item-a"), candidate("item-b")],
    );
    expect(result.toImport.map((c) => c.academyItemId)).toEqual(["item-b"]);
    expect(result.skipped).toBe(2);
  });

  it("does not treat a manual or plan task as already imported, and leaves a single import alone", () => {
    const manual: TrainingTask = { ...importedToday("item-a"), source: "manual", academyItemId: undefined };
    const result = filterNewAcademyCandidates([manual], [candidate("item-a")]);
    expect(result.toImport.map((c) => c.academyItemId)).toEqual(["item-a"]);
    expect(result.skipped).toBe(0);
  });

  it("an empty batch imports nothing", () => {
    expect(filterNewAcademyCandidates([importedToday("item-a")], [])).toEqual({ toImport: [], skipped: 0 });
  });
});

describe("a weekday routine whose two labels match the same drill", () => {
  // The two real drills from the 11-16 stage, in their real order, and nothing else: the fuzzy
  // matcher walks the items in order, and "Static Stretching" contains the keyword "Stretch" that
  // the second label carries, so both labels land on the first drill.
  const drill = (id: string, titleZh: string, titleEn: string): AcademyItem => ({
    ...ACADEMY_STAGES[0]!.modules[0]!.items[0]!,
    id,
    titleZh,
    titleEn,
  });
  const stage = {
    modules: [
      {
        items: [
          drill("drill-static", "静态拉伸（全面柔韧性）", "Static Stretching"),
          drill("drill-couch", "髋部屈肌深层拉伸（Couch Stretch）", "Couch Stretch (Deep Hip Flexors)"),
        ],
      },
    ],
  } as unknown as AcademyStage;
  const labels = ["静态拉伸（全面柔韧性） 15分", "髋部屈肌深层拉伸（Couch Stretch） 2组"];

  it("both labels first-match the same drill (the matcher is unchanged and fuzzy by design)", () => {
    expect(labels.map((label) => matchRoutineTaskLabel(stage, label)?.id)).toEqual(["drill-static", "drill-static"]);
  });

  it("the filter then keeps one task and reports the other as skipped", () => {
    const candidates = labels.map((label) => buildAcademyImportCandidate(matchRoutineTaskLabel(stage, label)!, "zh"));
    expect(candidates).toHaveLength(2);
    const result = filterNewAcademyCandidates([], candidates);
    expect(result.toImport.map((c) => c.academyItemId)).toEqual(["drill-static"]);
    expect(result.skipped).toBe(1);
  });
});
