import { describe, expect, it } from "vitest";

import type { CatalogRef } from "@skatingx/schema";

import { ACADEMY_CATALOG_LINKS, resolveCatalogForAcademyItem } from "./catalog-mapping";

const SAMPLE_REF: CatalogRef = {
  kind: "drill",
  id: "DR-TEST-001",
  contentVersion: "1",
};

const SAMPLE_LINKS: Readonly<Record<string, CatalogRef>> = {
  "test-academy-item": SAMPLE_REF,
};

describe("resolveCatalogForAcademyItem", () => {
  it("returns undefined while the reviewed table is empty", () => {
    expect(Object.keys(ACADEMY_CATALOG_LINKS)).toHaveLength(0);
    expect(resolveCatalogForAcademyItem("age11_13-m4-i0")).toBeUndefined();
    expect(resolveCatalogForAcademyItem("missing-id")).toBeUndefined();
  });

  it("returns only the id present in the table it is given", () => {
    expect(resolveCatalogForAcademyItem("test-academy-item", SAMPLE_LINKS)).toEqual(SAMPLE_REF);
    expect(resolveCatalogForAcademyItem("age11_13-m4-i0", SAMPLE_LINKS)).toBeUndefined();
    expect(resolveCatalogForAcademyItem("missing-id", SAMPLE_LINKS)).toBeUndefined();
  });
});
