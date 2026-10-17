import { ACADEMY_STAGES } from "@skatingx/content";
import { describe, expect, it } from "vitest";

import { buildAcademyImportCandidate } from "./academy";

const item = ACADEMY_STAGES[0]!.modules[0]!.items[0]!;

describe("buildAcademyImportCandidate", () => {
  it("writes the task in one language: title, target, description and tags together", () => {
    expect(buildAcademyImportCandidate(item, "zh")).toEqual({
      academyItemId: item.id,
      text: item.titleZh,
      target: item.targetZh,
      description: item.descriptionZh,
      tags: item.tagsZh,
    });
    expect(buildAcademyImportCandidate(item, "en")).toEqual({
      academyItemId: item.id,
      text: item.titleEn,
      target: item.targetEn,
      description: item.descriptionEn,
      tags: item.tagsEn,
    });
  });

  it("the id does not depend on the language", () => {
    expect(buildAcademyImportCandidate(item, "en").academyItemId).toBe(
      buildAcademyImportCandidate(item, "zh").academyItemId,
    );
  });
});
