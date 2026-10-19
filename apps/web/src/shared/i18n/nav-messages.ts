import { createTranslator, type Resources } from "./translator";

/**
 * Navigation labels: the bottom bar, the Training and Analysis sub-navigation, and their
 * accessible names. The Race Day tab label is not here; it comes from the Race Day core resource
 * so that module's text stays in one place.
 *
 * `zh` defines the keys and `en` is typed against them, so a missing or extra translation is a
 * compile error rather than a blank tab.
 */
const zh = {
  "nav.primary.label": "主导航",
  "nav.primary.dashboard": "总览",
  "nav.primary.training": "训练",
  "nav.primary.analysis": "分析",
  "nav.primary.aiCoach": "AI 教练",
  "nav.primary.settings": "设置",

  "nav.training.section": "训练分区",
  "nav.training.home": "首页",
  "nav.training.plan": "计划",
  "nav.training.tasks": "任务",
  "nav.training.academy": "学院",
  "nav.training.records": "纪录",
  "nav.training.shop": "商店",

  "nav.analysis.section": "分析分区",
  "nav.analysis.hub": "首页",
  "nav.analysis.biomechanics": "动作分析",
  "nav.analysis.pacing": "配速",
  "nav.analysis.equipment": "装备",
} as const;

type NavKey = keyof typeof zh;

const en: Record<NavKey, string> = {
  "nav.primary.label": "Main",
  "nav.primary.dashboard": "Dashboard",
  "nav.primary.training": "Training",
  "nav.primary.analysis": "Analysis",
  "nav.primary.aiCoach": "AI Coach",
  "nav.primary.settings": "Settings",

  "nav.training.section": "Training sections",
  "nav.training.home": "Home",
  "nav.training.plan": "Plan",
  "nav.training.tasks": "Tasks",
  "nav.training.academy": "Academy",
  "nav.training.records": "Records",
  "nav.training.shop": "Shop",

  "nav.analysis.section": "Analysis sections",
  "nav.analysis.hub": "Hub",
  "nav.analysis.biomechanics": "Biomechanics",
  "nav.analysis.pacing": "Pacing",
  "nav.analysis.equipment": "Equipment",
};

export type NavMessageKey = NavKey;

export const navResources: Resources<NavKey> = { zh, en };

export const tNav = createTranslator(navResources);
