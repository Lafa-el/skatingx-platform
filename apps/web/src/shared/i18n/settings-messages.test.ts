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

  it("no longer says the navigation is English only (S6b), but still warns about unfinished pages", () => {
    for (const lang of ["zh", "en"] as const) {
      const note = tSettings(lang, "settings.language.description");
      expect(note).not.toMatch(/底部导航|bottom navigation/i);
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
