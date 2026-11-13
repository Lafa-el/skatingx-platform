import { describe, expect, it } from "vitest";

import { contentChecksumPayload, type CatalogChecksumInput } from "./catalog-object";
import { computeCatalogChecksum } from "./checksum";

describe("computeCatalogChecksum", () => {
  it("is stable for the same payload and for shuffled keys", () => {
    const first = {
      b: 1,
      a: { d: 2, c: [3, 1] },
    };
    const shuffled = {
      a: { c: [3, 1], d: 2 },
      b: 1,
    };
    const once = computeCatalogChecksum(first);
    const twice = computeCatalogChecksum(first);
    expect(once).toBe(twice);
    expect(computeCatalogChecksum(shuffled)).toBe(once);
    expect(once).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when one field changes", () => {
    const before = computeCatalogChecksum({ name: "Drop Jump", n: 1 });
    const after = computeCatalogChecksum({ name: "Drop Jump", n: 2 });
    expect(after).not.toBe(before);
  });
});

describe("content checksum payload", () => {
  const content: CatalogChecksumInput = {
    localeContent: { zh: { name: "下落跳" }, en: { name: "Drop Jump" } },
    taxonomy: { objectiveIds: ["OBJ15"] },
    refs: [],
    legacyAttributes: { supervision: "Qualified adult/coach" },
    schemaVersion: 1,
    supersedesVersion: "v1",
  };

  it("keeps exactly the six content fields and ignores status and review fields", () => {
    const withReview = contentChecksumPayload({
      ...content,
      status: "draft",
      reviewStatus: "pending",
      contentVersion: "v9",
      checksum: "nope",
      publishedVersion: "v1",
    } as CatalogChecksumInput);
    const otherReview = contentChecksumPayload({
      ...content,
      status: "published",
      reviewStatus: "approved",
    } as CatalogChecksumInput);
    expect(Object.keys(withReview).sort()).toEqual([
      "legacyAttributes",
      "localeContent",
      "refs",
      "schemaVersion",
      "supersedesVersion",
      "taxonomy",
    ]);
    expect("contentVersion" in withReview).toBe(false);
    expect(computeCatalogChecksum(withReview)).toBe(computeCatalogChecksum(otherReview));
  });

  it("changes the checksum when supersedesVersion is omitted", () => {
    const { supersedesVersion: _dropped, ...without } = content;
    expect(computeCatalogChecksum(contentChecksumPayload(content))).not.toBe(
      computeCatalogChecksum(contentChecksumPayload(without)),
    );
    expect(Object.keys(contentChecksumPayload(without))).not.toContain("supersedesVersion");
  });
});
