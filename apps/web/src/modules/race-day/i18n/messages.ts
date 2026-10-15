import { createTranslator, type Resources } from "@/shared/i18n/translator";

import { coreResources, type RaceDayCoreKey } from "./core-messages";

/**
 * Full Race Day text resource (zh/en), loaded with the module chunk. Keys are named by
 * domain (`raceDay.tab.schedule`), not by English sentence (AGENTS.md).
 *
 * `zh` defines the keys and `en` is typed against them, so a missing or extra translation
 * is a compile error rather than a blank label.
 */
const zh = {
  "raceDay.title": "比赛日助手",
  "raceDay.phase0.notice": "实测版:数据为手动录入,未核对的数据会标为“待确认”。",
  "raceDay.tab.today": "今天",
  "raceDay.tab.schedule": "赛程",
  "raceDay.tab.results": "成绩",
  "raceDay.tab.videos": "视频",
  "raceDay.tab.summary": "总结",
  "raceDay.tab.setup": "设置",
  "raceDay.nav.section": "比赛日分区",
  "raceDay.placeholder.notAvailable": "此部分尚未开放,将在后续版本提供。",
} as const;

type ModuleKey = keyof typeof zh;

const en: Record<ModuleKey, string> = {
  "raceDay.title": "Race Day Companion",
  "raceDay.phase0.notice":
    "Field-test version: data is entered by hand, and unverified data is marked Pending.",
  "raceDay.tab.today": "Today",
  "raceDay.tab.schedule": "Schedule",
  "raceDay.tab.results": "Results",
  "raceDay.tab.videos": "Videos",
  "raceDay.tab.summary": "Summary",
  "raceDay.tab.setup": "Setup",
  "raceDay.nav.section": "Race Day sections",
  "raceDay.placeholder.notAvailable":
    "This section is not available yet. It will arrive in a later version.",
};

export type RaceDayMessageKey = ModuleKey | RaceDayCoreKey;

// Core keys are merged in so the module can use one translator for everything.
export const raceDayResources: Resources<RaceDayMessageKey> = {
  zh: { ...coreResources.zh, ...zh },
  en: { ...coreResources.en, ...en },
};

export const t = createTranslator(raceDayResources);
