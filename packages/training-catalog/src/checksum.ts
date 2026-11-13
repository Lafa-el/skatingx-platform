/**
 * checksum 用 node:crypto。本文件不从 src/index.ts 再导出，
 * 避免浏览器包引入 node:crypto。测试直接从本模块 import。
 */
import { createHash } from "node:crypto";

/** SHA-256 hex of canonical JSON: object keys sorted recursively, arrays keep order. */
export function computeCatalogChecksum(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
