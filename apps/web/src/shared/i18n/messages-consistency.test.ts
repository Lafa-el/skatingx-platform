import { describe, expect, it } from "vitest";

import { halfWidthPunctuation } from "@/test/zhPunctuation";

import type { Resources } from "./translator";

/**
 * Checks every shared resource file (`shared/i18n/*-messages.ts`, ADR-004 D4) the same way. The
 * files are found by pattern, so a resource added in a later slice is covered without editing
 * this test, and one cannot be forgotten.
 */
const modules = import.meta.glob<Record<string, unknown>>("./*-messages.ts", { eager: true });

function isResources(value: unknown): value is Resources<string> {
  return typeof value === "object" && value !== null && "zh" in value && "en" in value;
}

const resourceSets = Object.entries(modules).flatMap(([file, exports]) =>
  Object.entries(exports)
    .filter((entry): entry is [string, Resources<string>] => isResources(entry[1]))
    .map(([name, resources]) => ({ file, name, resources })),
);

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("shared i18n resources", () => {
  it("finds the resource files, so an empty result cannot pass by accident", () => {
    const names = resourceSets.map((set) => set.name);
    expect(names).toEqual(expect.arrayContaining(["settingsResources", "navResources", "shellResources"]));
  });

  describe.each(resourceSets)("$file ($name)", ({ resources }) => {
    it("zh and en have exactly the same keys", () => {
      expect(Object.keys(resources.en).sort()).toEqual(Object.keys(resources.zh).sort());
    });

    it("no text is empty, and both languages use the same placeholders", () => {
      for (const key of Object.keys(resources.zh)) {
        const zh = resources.zh[key] ?? "";
        const en = resources.en[key] ?? "";
        expect(zh.trim(), `zh ${key}`).not.toBe("");
        expect(en.trim(), `en ${key}`).not.toBe("");
        expect(placeholders(en), key).toEqual(placeholders(zh));
      }
    });

    it("Chinese text uses full-width punctuation next to Chinese characters", () => {
      const wrong = Object.entries(resources.zh).flatMap(([key, text]) =>
        halfWidthPunctuation(text).map((pair) => `${key}: ${pair}`),
      );
      expect(wrong).toEqual([]);
    });

    it("keys are named by domain, not by English sentence", () => {
      for (const key of Object.keys(resources.zh)) {
        expect(key, key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/);
      }
    });
  });

  // The PRO switch in Settings was a development tool and is gone. Copy that still sends people to
  // it, or calls PRO a development flag, would be a dead instruction.
  it("no text points to a development PRO switch in Settings", () => {
    const stale = /开发开关|开发用|（开发[^）]*）|设置中开启 PRO|\(dev\)|development (flag|toggle)|PRO in Settings/i;
    const found = resourceSets.flatMap(({ file, resources }) =>
      (["zh", "en"] as const).flatMap((language) =>
        Object.entries(resources[language])
          .filter(([, text]) => stale.test(text))
          .map(([key]) => `${file} ${language} ${key}`),
      ),
    );
    expect(found).toEqual([]);
  });

  // Nothing in the app turns PRO on for the user; an administrator does it. A text that tells them
  // to turn it on or unlock it promises something they cannot do.
  it("no text tells the user to turn on or unlock PRO themselves", () => {
    const selfService = /开启 PRO|开通 PRO|解锁 PRO|升级到? PRO|(unlock|turn on|enable|upgrade to|go) PRO/i;
    const found = resourceSets.flatMap(({ file, resources }) =>
      (["zh", "en"] as const).flatMap((language) =>
        Object.entries(resources[language])
          .filter(([, text]) => selfService.test(text))
          .map(([key]) => `${file} ${language} ${key}`),
      ),
    );
    expect(found).toEqual([]);
  });

  it("keys are unique across files, so two domains cannot silently share one", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const { file, resources } of resourceSets) {
      for (const key of Object.keys(resources.zh)) {
        const first = seen.get(key);
        if (first !== undefined && first !== file) {
          clashes.push(`${key} in ${first} and ${file}`);
        }
        seen.set(key, file);
      }
    }
    expect(clashes).toEqual([]);
  });
});
