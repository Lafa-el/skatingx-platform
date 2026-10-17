import { createTranslator, type Resources } from "./translator";

/**
 * Text for the language setting. It lives in the shared i18n layer, not in a module, because the
 * setting is global. The title names both languages on purpose, so someone who landed in the
 * wrong language can still find the control.
 */
const zh = {
  "settings.language.title": "语言 / Language",
  "settings.language.description": "选择界面语言。部分页面(训练和分析)暂时仍是英文。",
  "settings.language.option.zh": "中文",
  "settings.language.option.en": "English",
  "settings.language.error": "语言没有保存成功。请检查网络后再试。",
} as const;

type SettingsKey = keyof typeof zh;

const en: Record<SettingsKey, string> = {
  "settings.language.title": "Language / 语言",
  "settings.language.description":
    "Choose the interface language. Some screens (Training and Analysis) are still English only.",
  // Each language is named in its own language, so it is recognizable whichever one is active.
  "settings.language.option.zh": "中文",
  "settings.language.option.en": "English",
  "settings.language.error": "The language was not saved. Please check your connection and try again.",
};

export type SettingsMessageKey = SettingsKey;

export const settingsResources: Resources<SettingsKey> = { zh, en };

export const tSettings = createTranslator(settingsResources);
