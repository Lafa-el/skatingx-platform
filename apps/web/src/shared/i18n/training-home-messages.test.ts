import { describe, expect, it } from "vitest";

import { tTrainingHome } from "./training-home-messages";

describe("training home wording decided by the owner (2026-10-16)", () => {
  it("keeps BLAZE Academy as the product name in both languages", () => {
    for (const locale of ["zh", "en"] as const) {
      expect(tTrainingHome(locale, "trainingHome.academy.import"), locale).toContain("BLAZE Academy");
      expect(tTrainingHome(locale, "trainingHome.shortcut.academy.fallback"), locale).toBe("BLAZE Academy");
    }
  });

  it("says 陆地训练 for dryland training", () => {
    expect(tTrainingHome("zh", "trainingHome.academy.import")).toBe("从 BLAZE Academy 导入陆地训练。");
    expect(tTrainingHome("zh", "trainingHome.shortcut.academy.body", { stage: "X" })).toBe("X · 陆地训练计划");
    expect(tTrainingHome("zh", "trainingHome.academy.import")).not.toContain("陆上");
  });
});
