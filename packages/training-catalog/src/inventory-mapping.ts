import type { CatalogKind } from "@skatingx/schema";

import type { CatalogObject, CatalogObjectEdge, CatalogTaxonomy } from "./catalog-object";

/**
 * 工作簿清单的一条记录。一等字段以外的列都可选，缺列与空值按映射规则丢弃。
 * source 与 exerciseRefsSource 是导入溯源，不进入内容字段。
 */
export interface InventoryRecord {
  id: string;
  nameZh: string;
  nameEn: string;
  legacyAttributes: Record<string, unknown>;
  sectionId?: string;
  primaryObjectiveId?: string;
  secondaryObjectiveIds?: string[];
  modality?: string;
  energySystemId?: string;
  environment?: string;
  equipment?: string;
  focusTags?: string;
  youthDefault?: string;
  supervision?: string;
  safetyFlag?: string;
  defaultSets?: string;
  defaultReps?: string;
  distance?: string;
  duration?: string;
  target?: string;
  rest?: string;
  rpe?: string;
  load?: string;
  taperCompatible?: string;
  trainingPhase?: string;
  primaryGoal?: string;
  drillRefs?: string[];
  blockRefs?: string[];
  exerciseRefs?: string[];
  source?: { row: number; sheet: string };
  exerciseRefsSource?: string;
}

export interface CatalogContent {
  localeContent: CatalogObject["localeContent"];
  taxonomy: CatalogTaxonomy;
  refs: CatalogObjectEdge[];
  legacyAttributes: Record<string, unknown>;
}

const LEGACY_FIELDS: Readonly<Record<CatalogKind, readonly (keyof InventoryRecord)[]>> = {
  exercise: ["environment", "equipment", "focusTags", "youthDefault", "supervision", "safetyFlag"],
  drill: [
    "environment",
    "focusTags",
    "defaultSets",
    "defaultReps",
    "distance",
    "duration",
    "target",
    "rest",
    "rpe",
    "load",
    "taperCompatible",
    "supervision",
  ],
  block: ["environment", "duration", "load", "taperCompatible"],
  session: ["environment", "trainingPhase", "duration", "load", "primaryGoal", "taperCompatible"],
};

const REF_FIELD: Readonly<Record<CatalogKind, "exerciseRefs" | "drillRefs" | "blockRefs">> = {
  exercise: "exerciseRefs",
  drill: "exerciseRefs",
  block: "drillRefs",
  session: "blockRefs",
};

/** 清单记录 → Catalog 内容字段。不含 id、生命周期和审核字段。 */
export function mapInventoryRecordToCatalogContent(
  kind: CatalogKind,
  record: InventoryRecord,
): CatalogContent {
  const objectiveIds = [record.primaryObjectiveId, ...(record.secondaryObjectiveIds ?? [])].filter(
    isNonEmptyString,
  );
  const taxonomy: CatalogTaxonomy = { objectiveIds };
  if (isNonEmptyString(record.sectionId)) taxonomy.sectionId = record.sectionId;
  if (isNonEmptyString(record.energySystemId)) taxonomy.energySystemId = record.energySystemId;
  if (isNonEmptyString(record.modality)) taxonomy.modality = record.modality;

  const legacyAttributes: Record<string, unknown> = {};
  for (const field of LEGACY_FIELDS[kind]) {
    const value = record[field];
    if (typeof value === "string" && value !== "") {
      legacyAttributes[field] = value;
    }
  }
  for (const [key, value] of Object.entries(record.legacyAttributes)) {
    if (Object.prototype.hasOwnProperty.call(legacyAttributes, key)) {
      throw new Error(`legacyAttributes key conflict on ${key}`);
    }
    legacyAttributes[key] = value;
  }

  const refIds = record[REF_FIELD[kind]] ?? [];
  return {
    localeContent: {
      zh: { name: record.nameZh },
      en: { name: record.nameEn },
    },
    taxonomy,
    refs: refIds.filter(isNonEmptyString).map((id) => ({ id, contentVersion: "v1" })),
    legacyAttributes,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
