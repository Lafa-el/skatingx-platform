import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

import { toFullWidthBrackets } from "./zh-punctuation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const raw = require("../src/academy-legacy-raw.cjs");

const DAY_MAP = {
  周日: "sunday",
  周一: "monday",
  周二: "tuesday",
  周三: "wednesday",
  周四: "thursday",
  周五: "friday",
  周六: "saturday",
  Sun: "sunday",
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
};

function inferCategory(tag, moduleName) {
  const t = `${tag}${moduleName}`.toLowerCase();
  if (/recovery|恢复|拉伸|foam|冰浴|stretch/i.test(t)) return "recovery";
  if (/mobility|柔韧|flex|髋|踝/i.test(t)) return "mobility";
  if (/tech|技术|摆臂|蹬|弯道|站位/i.test(t)) return "technique";
  if (/力量|squat|硬拉|引体|power|strength|max/i.test(t)) return "strength";
  return "dryland";
}

// Applied to every Chinese string we copy out of the legacy extract, which stays as the source wrote it.
const zhText = (text) => toFullWidthBrackets(text);
const zhLabel = (text) => toFullWidthBrackets(text, { isPlanLabel: true });

function parseTags(tag) {
  return String(tag || "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildStages() {
  const zh = raw.zh;
  const en = raw.en;
  return zh.map((z, si) => {
    const e = en[si];
    const modules = z.modules.map((zm, mi) => {
      const em = e.modules[mi];
      const items = zm.items.map((zi, ii) => {
        const ei = em.items[ii];
        const id = `${z.id}-m${mi}-i${ii}`;
        return {
          id,
          titleZh: zhText(zi.name),
          titleEn: ei.name,
          descriptionZh: zhText(zi.desc),
          descriptionEn: ei.desc,
          category: inferCategory(zi.tag, zm.name),
          targetZh: zhText(zi.target),
          targetEn: ei.target,
          tagsZh: parseTags(zi.tag).map(zhText),
          tagsEn: parseTags(ei.tag),
          difficultyLevel: z.id === "age4_6" ? 3 : z.id === "age7_10" ? 6 : 8,
        };
      });
      return {
        id: `${z.id}-mod-${mi}`,
        titleZh: zhText(zm.name),
        titleEn: em.name,
        descriptionZh: "",
        descriptionEn: "",
        items,
      };
    });

    const days = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    };
    const dayPlans = z.weeklyPlan.map((wp, wi) => {
      const weekday = DAY_MAP[wp.day] || "monday";
      const enPlan = e.weeklyPlan[wi];
      // A label with no English counterpart would show Chinese in English mode, so fail here.
      if (enPlan.tasks.length !== wp.tasks.length) {
        throw new Error(`${z.id} plan ${wi}: ${wp.tasks.length} Chinese labels, ${enPlan.tasks.length} English`);
      }
      const routineItems = wp.tasks.map((taskStr, ti) => ({
        routineItemId: `${z.id}-w${wi}-t${ti}`,
        taskLabelZh: zhLabel(taskStr),
        taskLabelEn: enPlan.tasks[ti],
      }));
      days[weekday] = routineItems;
      return {
        id: `${z.id}-wp-${wi}`,
        dayLabelZh: zhText(wp.day),
        dayLabelEn: e.weeklyPlan[wi].day,
        titleZh: zhText(wp.title),
        titleEn: e.weeklyPlan[wi].title,
        durationZh: zhText(wp.duration),
        durationEn: e.weeklyPlan[wi].duration,
        weekday,
        taskLabelsZh: wp.tasks.map(zhLabel),
        taskLabelsEn: enPlan.tasks,
      };
    });

    return {
      id: z.id,
      labelZh: zhText(z.title),
      labelEn: e.title,
      ageRangeZh: zhText(z.age),
      ageRangeEn: e.age,
      overviewZh: zhText(z.target),
      overviewEn: e.target,
      durationZh: zhText(z.duration),
      durationEn: e.duration,
      frequencyZh: zhText(z.frequency),
      frequencyEn: e.frequency,
      coreFocusZh: zhText(z.core),
      coreFocusEn: e.core,
      modules,
      weeklyRoutine: {
        id: `${z.id}-weekly`,
        stageId: z.id,
        titleZh: "参考周训练安排",
        titleEn: "Reference Weekly Plan",
        days,
        dayPlans,
      },
    };
  });
}

const stages = buildStages();
const out = `/** Auto-generated from blaze-skate-training BLAZE_ACADEMY. Chinese brackets are full-width (ADR-004 A5). */\nimport type { AcademyStage } from "./academy-types";\n\nexport const ACADEMY_STAGES: AcademyStage[] = ${JSON.stringify(stages, null, 2)};\n`;
// `--out <file>` lets a test regenerate into a temporary file without touching the committed one.
const outIndex = process.argv.indexOf("--out");
const target =
  outIndex >= 0 ? process.argv[outIndex + 1] : path.join(__dirname, "../src/academy-stages.generated.ts");
if (!target) {
  throw new Error("--out needs a file path");
}
fs.writeFileSync(target, out);
console.log(`Generated ${stages.length} stages`);
