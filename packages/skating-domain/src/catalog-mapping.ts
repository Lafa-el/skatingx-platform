/**
 * 映射表目前为空，没有已复核的 Academy→Catalog 映射。
 * 条目只能由人工复核后逐条加入，后续步骤的事。
 * 无映射即无链接，禁止从中文标签推断。
 */

import type { CatalogRef } from "@skatingx/schema";

export const ACADEMY_CATALOG_LINKS: Readonly<Record<string, CatalogRef>> = {};

export function resolveCatalogForAcademyItem(
  academyItemId: string,
  links: Readonly<Record<string, CatalogRef>> = ACADEMY_CATALOG_LINKS,
): CatalogRef | undefined {
  return links[academyItemId];
}
