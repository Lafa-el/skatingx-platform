import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ACADEMY_STAGES } from "./academy";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// The committed extract of the legacy BLAZE_ACADEMY, which has both languages.
const legacy = require("./academy-legacy-raw.cjs") as {
  zh: LegacyStage[];
  en: LegacyStage[];
};
type LegacyStage = {
  id: string;
  age: string;
  weeklyPlan: { day: string; tasks: string[] }[];
};

const CJK = /[\u3400-\u9fff\uff00-\uffef]/;

describe("academy content: both languages are complete", () => {
  it("has the three stages the legacy app has", () => {
    expect(ACADEMY_STAGES.map((s) => s.id)).toEqual(legacy.zh.map((s) => s.id));
    expect(ACADEMY_STAGES).toHaveLength(3);
  });

  it("every stage has an age range in both languages, taken from the legacy source", () => {
    ACADEMY_STAGES.forEach((stage, i) => {
      expect(stage.ageRangeZh, stage.id).toBe(legacy.zh[i]!.age);
      expect(stage.ageRangeEn, stage.id).toBe(legacy.en[i]!.age);
      expect(stage.ageRangeEn.trim(), stage.id).not.toBe("");
      expect(CJK.test(stage.ageRangeEn), `${stage.id} English age range has Chinese: ${stage.ageRangeEn}`).toBe(false);
    });
  });

  it("every day plan has as many English task labels as Chinese ones, none empty or in Chinese", () => {
    let seen = 0;
    ACADEMY_STAGES.forEach((stage, si) => {
      stage.weeklyRoutine.dayPlans.forEach((plan, pi) => {
        expect(plan.taskLabelsEn, plan.id).toHaveLength(plan.taskLabelsZh.length);
        expect(plan.taskLabelsZh, plan.id).toEqual(legacy.zh[si]!.weeklyPlan[pi]!.tasks);
        expect(plan.taskLabelsEn, plan.id).toEqual(legacy.en[si]!.weeklyPlan[pi]!.tasks);
        for (const label of plan.taskLabelsEn) {
          seen += 1;
          expect(label.trim(), plan.id).not.toBe("");
          expect(CJK.test(label), `${plan.id} English label has Chinese: ${label}`).toBe(false);
        }
      });
    });
    // Guards the loops above against passing on empty data.
    expect(seen).toBe(63);
  });

  it("every weekday routine item carries the same two labels as its day plan, in the same order", () => {
    let seen = 0;
    for (const stage of ACADEMY_STAGES) {
      for (const plan of stage.weeklyRoutine.dayPlans) {
        const items = stage.weeklyRoutine.days[plan.weekday];
        expect(items.map((i) => i.taskLabelZh), plan.id).toEqual(plan.taskLabelsZh);
        expect(items.map((i) => i.taskLabelEn), plan.id).toEqual(plan.taskLabelsEn);
        seen += items.length;
      }
    }
    expect(seen).toBe(63);
  });
});

describe("academy content: the generated file is what the generator produces", () => {
  it("regenerating from the committed legacy extract gives the committed file", () => {
    // A hand edit of the generated file, or a stale one, would otherwise go unnoticed.
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "academy-")), "out.ts");
    execFileSync(process.execPath, [path.join(here, "../scripts/generate-academy.mjs"), "--out", out], {
      stdio: "pipe",
    });
    const committed = fs.readFileSync(path.join(here, "academy-stages.generated.ts"), "utf8");
    expect(fs.readFileSync(out, "utf8") === committed).toBe(true);
  });
});
