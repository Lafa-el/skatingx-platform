/**
 * checksum 用 node:crypto。本文件不从 src/index.ts 再导出，
 * 避免浏览器包引入 node:crypto。测试直接从本模块 import。
 * 字节序列来自 canonicalCatalogJson，那个函数可以进浏览器包。
 */
import { createHash } from "node:crypto";

import { canonicalCatalogJson } from "./canonical-json";

/** SHA-256 hex of canonicalCatalogJson(payload). */
export function computeCatalogChecksum(payload: unknown): string {
  return createHash("sha256").update(canonicalCatalogJson(payload), "utf8").digest("hex");
}
