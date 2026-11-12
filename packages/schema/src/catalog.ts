/**
 * 本文件只定义 Catalog 引用的形状。CatalogObject 本体与版本化逻辑是 P1 的事。
 */

export type CatalogKind = "exercise" | "drill" | "block" | "session";

/** contentVersion 是 CatalogObject 已发布版本的版本号（ADR-019）；id 是工作簿原 ID（EX-/DR-/BL-/SESS-）。 */
export interface CatalogRef {
  kind: CatalogKind;
  id: string;
  contentVersion: string;
}
