import { describe, expect, it } from "vitest";

import { coreResources } from "./core-messages";
import { raceDayResources, t } from "./messages";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Race Day resources", () => {
  it("zh and en have exactly the same keys", () => {
    expect(Object.keys(raceDayResources.en).sort()).toEqual(Object.keys(raceDayResources.zh).sort());
  });

  it("no text is empty, and both languages use the same placeholders", () => {
    for (const key of Object.keys(raceDayResources.zh) as (keyof typeof raceDayResources.zh)[]) {
      const zh = raceDayResources.zh[key];
      const en = raceDayResources.en[key];
      expect(zh.trim(), `zh ${key}`).not.toBe("");
      expect(en.trim(), `en ${key}`).not.toBe("");
      expect(placeholders(en), key).toEqual(placeholders(zh));
    }
  });

  it("keys are named by domain, not by English sentence", () => {
    for (const key of Object.keys(raceDayResources.zh)) {
      expect(key, key).toMatch(/^raceDay(\.[a-zA-Z0-9]+)+$/);
    }
  });

  it("the shell's core keys and the module's resource agree", () => {
    for (const locale of ["zh", "en"] as const) {
      for (const [key, text] of Object.entries(coreResources[locale])) {
        expect(raceDayResources[locale][key as keyof typeof coreResources.zh]).toBe(text);
      }
    }
  });

  it("the unverified-data notice uses the agreed term in each language", () => {
    expect(t("zh", "raceDay.phase0.notice")).toContain("待确认");
    expect(t("en", "raceDay.phase0.notice")).toContain("Pending");
  });
});
