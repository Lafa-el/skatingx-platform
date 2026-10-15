import { describe, expect, it } from "vitest";

import { createTranslator, toLocale } from "./translator";

const t = createTranslator({
  zh: { "demo.title": "标题", "demo.count": "共 {count} 项,来自 {name}" },
  en: { "demo.title": "Title", "demo.count": "{count} items from {name}" },
});

describe("createTranslator", () => {
  it("returns the text for the locale", () => {
    expect(t("zh", "demo.title")).toBe("标题");
    expect(t("en", "demo.title")).toBe("Title");
  });

  it("interpolates numbers and strings", () => {
    expect(t("en", "demo.count", { count: 3, name: "X" })).toBe("3 items from X");
    expect(t("zh", "demo.count", { count: 0, name: "X" })).toBe("共 0 项,来自 X");
  });

  it("leaves an unknown placeholder visible instead of rendering nothing", () => {
    expect(t("en", "demo.count", { count: 3 })).toBe("3 items from {name}");
  });
});

describe("toLocale", () => {
  it("only 'en' selects English; everything else is the Chinese default", () => {
    expect(toLocale("en")).toBe("en");
    expect(toLocale("zh")).toBe("zh");
    for (const other of [undefined, null, "", "EN", "fr", 1]) {
      expect(toLocale(other)).toBe("zh");
    }
  });
});
