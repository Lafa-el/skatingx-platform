import { describe, expect, it } from "vitest";

import { settingsResources, tSettings } from "./settings-messages";

describe("settings messages", () => {
  it("has exactly the same keys in both languages and no empty text", () => {
    expect(Object.keys(settingsResources.en).sort()).toEqual(Object.keys(settingsResources.zh).sort());
    for (const lang of ["zh", "en"] as const) {
      for (const text of Object.values(settingsResources[lang])) {
        expect(text.trim()).not.toBe("");
      }
    }
  });

  it("names the screens that are still English (Training, Analysis), not ones that are done", () => {
    for (const lang of ["zh", "en"] as const) {
      const note = tSettings(lang, "settings.language.description");
      // Done: navigation (S6b), Settings, Dashboard, Athlete, AI Coach (S6c).
      expect(note).not.toMatch(/底部导航|设置页|bottom navigation|this page/i);
      expect(note).toMatch(/训练|Training/);
      expect(note).toMatch(/分析|Analysis/);
      expect(note).toMatch(/暂时仍是英文|still English only/);
    }
  });

  it("names both languages in the title, in either language", () => {
    for (const lang of ["zh", "en"] as const) {
      const title = tSettings(lang, "settings.language.title");
      expect(title).toContain("Language");
      expect(title).toContain("语言");
    }
  });

  it("writes each language's own name the same way whichever language is active", () => {
    expect(tSettings("zh", "settings.language.option.en")).toBe("English");
    expect(tSettings("en", "settings.language.option.en")).toBe("English");
    expect(tSettings("zh", "settings.language.option.zh")).toBe("中文");
    expect(tSettings("en", "settings.language.option.zh")).toBe("中文");
  });
});
