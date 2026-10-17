import { createTranslator, type Locale, type Resources } from "./translator";

/**
 * Text of the Academy page and of the import it runs. The stage, module, drill and plan names and
 * descriptions come from the content package, which carries its own Chinese and English; they are
 * not in here. Where the Chinese already existed it is kept word for word.
 */
const zh = {
  "academy.title": "BLAZE SKATE Academy",
  "academy.subtitle": "全周期速滑专业陆地训练 — 免费浏览；单项可随时导入今日任务。",
  "academy.unavailable": "学院内容暂不可用。",

  "academy.import.result": "已导入 {imported} 项，跳过 {skipped} 项（今日已存在）。",
  "academy.import.viewTasks": "查看任务",

  "academy.stage.duration": "时长",
  "academy.stage.frequency": "频率",
  "academy.stage.focus": "风格",

  "academy.modules.title": "训练模块",
  "academy.item.add": "导入今日",
  "academy.item.added": "已添加",

  "academy.category.dryland": "陆地训练",
  "academy.category.ice": "冰上",
  "academy.category.strength": "力量",
  "academy.category.mobility": "灵活性",
  "academy.category.technique": "技术",
  "academy.category.recovery": "恢复",

  "academy.routine.proTag": "（PRO）",
  "academy.routine.intro": "参考周计划 — 可随时浏览；批量导入需要 PRO。",
  "academy.routine.lock": "高阶计划导入需要 PRO。AI 训练计划尚未推出，推出后也将需要 PRO。",
  "academy.routine.weekday": "导入指定星期",
  "academy.routine.importDay": "导入该日",
  "academy.routine.importing": "导入中…",
  "academy.routine.importPlan": "导入本日到今日任务",

  "academy.weekday.monday": "周一",
  "academy.weekday.tuesday": "周二",
  "academy.weekday.wednesday": "周三",
  "academy.weekday.thursday": "周四",
  "academy.weekday.friday": "周五",
  "academy.weekday.saturday": "周六",
  "academy.weekday.sunday": "周日",

  "academy.pro.title": "PRO 功能",
  "academy.pro.import": "高阶计划导入（已开启）",
  "academy.pro.custom": "自定义训练方案（即将推出）",
  "academy.pro.coach": "AI 教练联动（即将推出）",
  "academy.pro.note": "支付尚未接入；PRO 为设置中的开发开关。",

  "academy.error.importFailed": "导入学院内容失败。",
  "academy.error.proRequired": "高阶计划导入需要 PRO。",
} as const;

type AcademyKey = keyof typeof zh;

const en: Record<AcademyKey, string> = {
  "academy.title": "BLAZE SKATE Academy",
  "academy.subtitle": "Professional dryland training — browse free; import single drills anytime.",
  "academy.unavailable": "Academy content is not available.",

  "academy.import.result": "Imported {imported}, skipped {skipped} (already on today’s list).",
  "academy.import.viewTasks": "View tasks",

  "academy.stage.duration": "Duration",
  "academy.stage.frequency": "Frequency",
  "academy.stage.focus": "Focus",

  "academy.modules.title": "Training modules",
  "academy.item.add": "Add to today",
  "academy.item.added": "Added",

  "academy.category.dryland": "Dryland",
  "academy.category.ice": "Ice",
  "academy.category.strength": "Strength",
  "academy.category.mobility": "Mobility",
  "academy.category.technique": "Technique",
  "academy.category.recovery": "Recovery",

  "academy.routine.proTag": "(PRO)",
  "academy.routine.intro": "Reference weekly plans — browse anytime; bulk import requires PRO.",
  "academy.routine.lock":
    "PRO required for advanced routine import. AI training plans are not available yet and will also need PRO.",
  "academy.routine.weekday": "Import weekday routine",
  "academy.routine.importDay": "Import day",
  "academy.routine.importing": "Importing…",
  "academy.routine.importPlan": "Import this plan to today",

  "academy.weekday.monday": "Mon",
  "academy.weekday.tuesday": "Tue",
  "academy.weekday.wednesday": "Wed",
  "academy.weekday.thursday": "Thu",
  "academy.weekday.friday": "Fri",
  "academy.weekday.saturday": "Sat",
  "academy.weekday.sunday": "Sun",

  "academy.pro.title": "PRO features",
  "academy.pro.import": "Advanced routine import (enabled)",
  "academy.pro.custom": "Custom training plans (coming)",
  "academy.pro.coach": "AI Coach integration (coming)",
  "academy.pro.note": "Payment is not integrated; PRO is a development toggle in Settings.",

  "academy.error.importFailed": "Academy import failed.",
  "academy.error.proRequired": "PRO is required for advanced routine import.",
};

export type AcademyMessageKey = AcademyKey;

export const academyResources: Resources<AcademyKey> = { zh, en };

export const tAcademy = createTranslator(academyResources);

/**
 * The stored `category` of a drill, as a name. The category is a closed list in the content
 * package, but a value we have no name for is shown as stored rather than guessed.
 */
export function formatAcademyCategory(category: string, locale: Locale): string {
  const key = `academy.category.${category}`;
  return Object.hasOwn(zh, key) ? tAcademy(locale, key as AcademyKey) : category;
}
