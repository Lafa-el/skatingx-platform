import type { CatalogKind, Timestamp } from "@skatingx/schema";

/**
 * 草案 schema，尚未冻结。冻结走 ChatGPT 独立复核，在 P1-2 之后。
 * 本模块只有类型与纯函数，不写 Firestore。
 */

export const CATALOG_SCHEMA_VERSION = 1;

export const CATALOG_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "deprecated",
  "archived",
] as const;

export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const REVIEW_STATUSES = [
  "pending",
  "in_review",
  "approved",
  "rejected",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** P0-4 规则公式里的 `<P1 初始值>`。草案新建时 reviewStatus 缺失或等于此值。 */
export const INITIAL_REVIEW_STATUS: ReviewStatus = "pending";

const ALLOWED_TRANSITIONS: Readonly<Record<CatalogStatus, readonly CatalogStatus[]>> = {
  draft: ["in_review"],
  in_review: ["approved", "draft"],
  approved: ["published"],
  published: ["deprecated"],
  deprecated: ["archived"],
  archived: [],
};

/**
 * 数据字典状态机。已发布版本不改写，修正走新版本，所以 published 不能回到更早状态。
 * in_review 被拒绝时回到 draft。拒绝原因不放在对象上，由受控流程写入审计日志。
 */
export function canTransitionStatus(from: CatalogStatus, to: CatalogStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

const CONTENT_VERSION = /^v([1-9]\d*)$/;

/** contentVersion 格式为 v<n>，n 从 1 起。P0-1 清单没有可继承的旧格式。 */
export function nextContentVersion(current: string): string {
  const match = CONTENT_VERSION.exec(current);
  if (!match) {
    throw new Error(`contentVersion must match v<n> starting at v1, received ${JSON.stringify(current)}`);
  }
  return `v${Number(match[1]) + 1}`;
}

export interface CatalogLocaleText {
  name: string;
  description?: string;
}

export interface CatalogTaxonomy {
  sectionId: string;
  objectiveIds: string[];
  energySystemId?: string;
  modality?: string;
}

export interface CatalogObjectEdge {
  id: string;
  contentVersion: string;
}

/**
 * 一条 Catalog 对象。status 与 reviewStatus 分开（ADR-019）。
 * 审核人字段是 reviewer，不是 reviewedBy：Links 表与 P0-4 规则公式用的都是 reviewer。
 * publishedVersion 指向当前已发布的 contentVersion；缺失表示尚未发布。
 * sourceLegacyId（stb_*）只作溯源，不是主键。
 */
export interface CatalogObject {
  id: string;
  kind: CatalogKind;
  sportId: "short_track";
  disciplineId?: string;
  localeContent: {
    zh: CatalogLocaleText;
    en: CatalogLocaleText;
  };
  schemaVersion: number;
  contentVersion: string;
  status: CatalogStatus;
  reviewStatus: ReviewStatus;
  reviewer?: string;
  reviewedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  sourceLegacyId?: string;
  supersedesVersion?: string;
  checksum: string;
  publishedVersion?: string;
  taxonomy: CatalogTaxonomy;
  refs: CatalogObjectEdge[];
  legacyAttributes: Record<string, unknown>;
}

/** Top-level CatalogObject keys. Unknown workbook columns stay in legacyAttributes. */
export const CATALOG_OBJECT_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "kind",
  "sportId",
  "disciplineId",
  "localeContent",
  "schemaVersion",
  "contentVersion",
  "status",
  "reviewStatus",
  "reviewer",
  "reviewedAt",
  "createdAt",
  "updatedAt",
  "sourceLegacyId",
  "supersedesVersion",
  "checksum",
  "publishedVersion",
  "taxonomy",
  "refs",
  "legacyAttributes",
]);

/**
 * versions 子集合的文档形状。
 * 不变量：版本文档 id 等于 contentVersion 字段；新建快照 status 必须是 draft；
 * 快照建后不可改（没有 update / delete，P2 的规则侧已定）。
 */
export interface CatalogVersion {
  contentVersion: string;
  status: CatalogStatus;
  checksum: string;
  localeContent: CatalogObject["localeContent"];
  taxonomy: CatalogTaxonomy;
  refs: CatalogObjectEdge[];
  legacyAttributes: Record<string, unknown>;
  schemaVersion: number;
  supersedesVersion?: string;
}
