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
  modules: { items: { tag: string }[] }[];
};

const CJK = /[\u3400-\u9fff\uff00-\uffef]/;

/** Spaces dropped and full-width marks written half-width: what must stay the same (see below). */
const squash = (text: string) =>
  text
    .replace(/\s+/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .replace(/：/g, ":");

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
        // The legacy Chinese is kept except for its punctuation (see the punctuation tests below).
        expect(plan.taskLabelsZh.map(squash), plan.id).toEqual(legacy.zh[si]!.weeklyPlan[pi]!.tasks.map(squash));
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

describe("academy content: drill tags in both languages", () => {
  // The legacy tags are space-separated keywords, so that is also how both languages are split.
  const words = (tag: string) => tag.split(/\s+/).filter(Boolean);

  it("every drill has tags in both languages, taken from the legacy source, and none in the wrong one", () => {
    let seen = 0;
    ACADEMY_STAGES.forEach((stage, si) => {
      stage.modules.forEach((module, mi) => {
        module.items.forEach((item, ii) => {
          seen += 1;
          expect(item.tagsZh, item.id).toEqual(words(legacy.zh[si]!.modules[mi]!.items[ii]!.tag));
          expect(item.tagsEn, item.id).toEqual(words(legacy.en[si]!.modules[mi]!.items[ii]!.tag));
          expect(item.tagsEn.length, `${item.id} has English tags`).toBeGreaterThan(0);
          expect(item.tagsEn.some((tag) => CJK.test(tag)), `${item.id} English tags: ${item.tagsEn}`).toBe(false);
          expect(item.tagsZh.every((tag) => CJK.test(tag)), `${item.id} Chinese tags: ${item.tagsZh}`).toBe(true);
        });
      });
    });
    // Guards the loops above against passing on empty data.
    expect(seen).toBe(66);
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

describe("academy content: Chinese punctuation (ADR-004 A5)", () => {
  /** Every Chinese string of the content, with where it is, so a failure says which one. */
  function chineseStrings(value: unknown, path = "stages"): { path: string; text: string }[] {
    if (typeof value === "string") {
      return CJK.test(value) ? [{ path, text: value }] : [];
    }
    if (Array.isArray(value)) {
      return value.flatMap((v, i) => chineseStrings(v, `${path}[${i}]`));
    }
    if (value && typeof value === "object") {
      return Object.entries(value).flatMap(([k, v]) => chineseStrings(v, `${path}.${k}`));
    }
    return [];
  }
  const all = chineseStrings(ACADEMY_STAGES);

  it("has the Chinese strings to check, so an empty list cannot pass by accident", () => {
    expect(all.length).toBeGreaterThan(500);
  });

  it("no half-width mark touches a Chinese character", () => {
    const wrong = all
      .filter(({ text }) => /[\u3400-\u9fff\uff00-\uffef]\s?[,;:?!()]|[,;:?!()]\s?[\u3400-\u9fff\uff00-\uffef]/.test(text))
      .map(({ path, text }) => `${path}: ${text}`);
    expect(wrong).toEqual([]);
  });

  it("drill titles, with the space before the bracket gone", () => {
    const titles = ACADEMY_STAGES.flatMap((s) => s.modules.flatMap((m) => m.items.map((i) => i.titleZh)));
    expect(titles).toContain("俯卧撑位平板支撑（改良版）");
    expect(titles).toContain("死虫式（Dead Bug）");
    expect(titles).toContain("滑行板（Slide Board）训练");
    expect(titles).toContain("深跳（Drop Jump） + 连续跳");
  });

  it("a plan label keeps the space before its amount, which is how the app splits name from target", () => {
    const labels = ACADEMY_STAGES.flatMap((s) => s.weeklyRoutine.dayPlans.flatMap((p) => p.taskLabelsZh));
    expect(labels).toContain("梯格游戏（速度梯）");
    expect(labels).toContain("负重深蹲（杠铃/哑铃） 5组x6次");
    expect(labels).toContain("髋部屈肌深层拉伸（Couch Stretch） 每侧60秒");
  });

  it("nothing but the punctuation changed in any title, label, description or target", () => {
    let seen = 0;
    ACADEMY_STAGES.forEach((stage, si) => {
      stage.modules.forEach((module, mi) => {
        module.items.forEach((item, ii) => {
          const old = legacy.zh[si]!.modules[mi]!.items[ii]! as unknown as Record<string, string>;
          seen += 1;
          expect(squash(item.titleZh), item.id).toBe(squash(old.name!));
          expect(squash(item.descriptionZh), item.id).toBe(squash(old.desc!));
          expect(squash(item.targetZh), item.id).toBe(squash(old.target!));
        });
      });
    });
    expect(seen).toBe(66);
  });
});
