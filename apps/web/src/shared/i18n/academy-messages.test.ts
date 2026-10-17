import { getAcademyStages } from "@skatingx/content";
import { describe, expect, it } from "vitest";

import { formatAcademyCategory, tAcademy } from "./academy-messages";

describe("Academy drill categories", () => {
  it("every category the content uses has a name in both languages", () => {
    const used = new Set(
      getAcademyStages().flatMap((stage) => stage.modules.flatMap((m) => m.items.map((i) => i.category))),
    );
    expect(used.size).toBeGreaterThan(0);
    for (const category of used) {
      for (const locale of ["zh", "en"] as const) {
        expect(formatAcademyCategory(category, locale), `${category} (${locale})`).not.toBe(category);
      }
    }
  });

  it("names", () => {
    expect(formatAcademyCategory("dryland", "zh")).toBe("陆地训练");
    expect(formatAcademyCategory("mobility", "zh")).toBe("灵活性");
    expect(formatAcademyCategory("dryland", "en")).toBe("Dryland");
    expect(formatAcademyCategory("recovery", "en")).toBe("Recovery");
  });

  it("a value we have no name for is shown as stored, including names that exist on every object", () => {
    expect(formatAcademyCategory("skiing", "zh")).toBe("skiing");
    expect(formatAcademyCategory("constructor", "en")).toBe("constructor");
    expect(formatAcademyCategory("toString", "zh")).toBe("toString");
  });
});

describe("Academy wording decided by the owner (2026-10-16)", () => {
  // AI training plans do not exist. The lock may say they will need PRO, but never that they are
  // available (AGENTS.md: no claim beyond what the product does).
  it("the PRO lock says AI training plans are not available yet, in both languages", () => {
    expect(tAcademy("zh", "academy.routine.lock")).toBe(
      "高阶计划导入需要 PRO。AI 训练计划尚未推出，推出后也将需要 PRO。",
    );
    expect(tAcademy("en", "academy.routine.lock")).toBe(
      "PRO required for advanced routine import. AI training plans are not available yet and will also need PRO.",
    );
  });

  it("says 陆地训练 for dryland", () => {
    expect(tAcademy("zh", "academy.subtitle")).toContain("陆地训练");
    expect(tAcademy("zh", "academy.subtitle")).not.toContain("陆上");
  });

  it("keeps the Academy's product name in both languages", () => {
    expect(tAcademy("zh", "academy.title")).toBe("BLAZE SKATE Academy");
    expect(tAcademy("en", "academy.title")).toBe("BLAZE SKATE Academy");
  });
});
