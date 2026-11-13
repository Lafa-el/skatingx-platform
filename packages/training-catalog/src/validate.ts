import type { CatalogKind } from "@skatingx/schema";

import { CATALOG_OBJECT_FIELDS, type CatalogObject, type CatalogObjectEdge, type CatalogVersion } from "./catalog-object";
import { canonicalCatalogJson } from "./canonical-json";

/**
 * 图节点的最小形状。CatalogObject 可以直接传入。
 * 本模块只有纯函数，不写 Firestore。
 */
export interface CatalogGraphNode {
  readonly id: string;
  readonly kind: CatalogKind;
  readonly refs: readonly CatalogObjectEdge[];
}

export interface CatalogRefError {
  kind: "unknown-id" | "unknown-version" | "wrong-kind";
  fromId: string;
  refId: string;
  refVersion: string;
}

/** session → block → drill → exercise。exercise 没有向外的边。 */
const ALLOWED_TARGET_KIND: Readonly<Record<CatalogKind, CatalogKind | null>> = {
  session: "block",
  block: "drill",
  drill: "exercise",
  exercise: null,
};

/**
 * 逐条检查 refs。重复引用不算错。
 * 同一条引用只报第一项：先 unknown-id，再 unknown-version，再 wrong-kind。
 */
export function validateCatalogRefs(
  nodes: readonly CatalogGraphNode[],
  knownVersions: ReadonlyMap<string, ReadonlySet<string>>,
): CatalogRefError[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const errors: CatalogRefError[] = [];
  for (const node of nodes) {
    for (const ref of node.refs) {
      const target = byId.get(ref.id);
      if (!target) {
        errors.push(refError("unknown-id", node.id, ref));
        continue;
      }
      const versions = knownVersions.get(ref.id);
      if (!versions?.has(ref.contentVersion)) {
        errors.push(refError("unknown-version", node.id, ref));
        continue;
      }
      if (ALLOWED_TARGET_KIND[node.kind] !== target.kind) {
        errors.push(refError("wrong-kind", node.id, ref));
      }
    }
  }
  return errors;
}

function refError(
  kind: CatalogRefError["kind"],
  fromId: string,
  ref: CatalogObjectEdge,
): CatalogRefError {
  return { kind, fromId, refId: ref.id, refVersion: ref.contentVersion };
}

/**
 * 有向简单环。每条环从环内字典序最小的 id 起，不重复起点。
 * 环与环按 id 序列的字典序排列。自引用是环。指向节点集之外的引用不参与成环。
 */
export function findCatalogCycles(nodes: readonly CatalogGraphNode[]): string[][] {
  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, readonly string[]>();
  for (const node of nodes) {
    const targets = new Set<string>();
    for (const ref of node.refs) {
      if (ids.has(ref.id)) targets.add(ref.id);
    }
    outgoing.set(node.id, [...targets].sort());
  }

  const cycles: string[][] = [];
  const seen = new Set<string>();
  for (const start of [...ids].sort()) {
    const path: string[] = [];
    const onPath = new Set<string>();
    const walk = (id: string): void => {
      path.push(id);
      onPath.add(id);
      for (const next of outgoing.get(id) ?? []) {
        if (next === start) {
          const key = path.join("\0");
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push([...path]);
          }
          continue;
        }
        if (next < start || onPath.has(next)) continue;
        walk(next);
      }
      path.pop();
      onPath.delete(id);
    };
    walk(start);
  }

  cycles.sort(compareCycles);
  return cycles;
}

function compareCycles(left: readonly string[], right: readonly string[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return left.length - right.length;
}

/** zh.name 与 en.name 去掉首尾空白后必须非空。description 不校验。 */
export function validateCatalogLocales(
  object: Pick<CatalogObject, "id" | "localeContent">,
): string[] {
  const errors: string[] = [];
  for (const locale of ["zh", "en"] as const) {
    const name = object.localeContent?.[locale]?.name;
    if (typeof name !== "string" || name.trim() === "") {
      errors.push(`${object.id}: localeContent.${locale}.name is empty`);
    }
  }
  return errors;
}

/** 顶层未知键报错。缺字段不在这里查；未知列应放进 legacyAttributes。 */
export function validateCatalogShape(object: unknown): string[] {
  if (object === null || typeof object !== "object" || Array.isArray(object)) {
    return ["CatalogObject must be an object"];
  }
  const errors: string[] = [];
  for (const key of Object.keys(object).sort()) {
    if (!CATALOG_OBJECT_FIELDS.has(key)) {
      errors.push(`${key} is not a CatalogObject field`);
    }
  }
  return errors;
}

/** 父对象与已发布快照的绑定。空数组表示成立。内容比较不含状态、版本号和审核字段。 */
export function checkPublishedBinding(parent: CatalogObject, version: CatalogVersion): string[] {
  const errors: string[] = [];
  if (parent.status !== "published") errors.push("parent status is not published");
  if (parent.publishedVersion !== version.contentVersion) {
    errors.push("publishedVersion does not match contentVersion");
  }
  if (parent.checksum !== version.checksum) errors.push("checksum does not match");
  if (version.status !== "published") errors.push("version status is not published");
  if (version.reviewStatus !== "approved") errors.push("version reviewStatus is not approved");
  if (canonicalCatalogJson(contentOf(parent)) !== canonicalCatalogJson(contentOf(version))) {
    errors.push("content fields do not match");
  }
  return errors;
}

function contentOf(
  value: Pick<CatalogObject, "localeContent" | "taxonomy" | "refs" | "legacyAttributes">,
): Pick<CatalogObject, "localeContent" | "taxonomy" | "refs" | "legacyAttributes"> {
  return {
    localeContent: value.localeContent,
    taxonomy: value.taxonomy,
    refs: value.refs,
    legacyAttributes: value.legacyAttributes,
  };
}
