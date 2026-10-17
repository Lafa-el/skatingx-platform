import { describe, expect, it } from "vitest";

import { ACADEMY_STAGES, localizeAcademyItem } from "./academy";

const item = ACADEMY_STAGES[0]!.modules[0]!.items[0]!;

describe("localizeAcademyItem", () => {
  it("gives the title, description, target and tags of the language asked for", () => {
    expect(localizeAcademyItem(item, "zh")).toEqual({
      title: item.titleZh,
      description: item.descriptionZh,
      target: item.targetZh,
      tags: item.tagsZh,
    });
    expect(localizeAcademyItem(item, "en")).toEqual({
      title: item.titleEn,
      description: item.descriptionEn,
      target: item.targetEn,
      tags: item.tagsEn,
    });
  });

  it("the two languages really differ for this drill, so the check above means something", () => {
    expect(item.tagsZh).not.toEqual(item.tagsEn);
    expect(item.tagsEn.length).toBeGreaterThan(0);
  });
});
