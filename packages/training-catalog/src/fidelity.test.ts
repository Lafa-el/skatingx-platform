import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CatalogKind } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import type { CatalogContent, InventoryRecord } from "./inventory-mapping";
import { mapInventoryRecordToCatalogContent } from "./inventory-mapping";

/** 字典表手写。不从映射函数导入，避免和实现共用一张表。 */
const LEGACY_FIELDS: Readonly<Record<CatalogKind, readonly string[]>> = {
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

const SHEETS = {
  exercises: "exercise",
  drills: "drill",
  blocks: "block",
  sessions: "session",
} as const;

const PROVENANCE = new Set(["source", "exerciseRefsSource"]);
const CONTENT_FIELDS = new Set([
  "nameZh",
  "nameEn",
  "sectionId",
  "primaryObjectiveId",
  "secondaryObjectiveIds",
  "modality",
  "energySystemId",
  "environment",
  "equipment",
  "focusTags",
  "youthDefault",
  "supervision",
  "safetyFlag",
  "defaultSets",
  "defaultReps",
  "distance",
  "duration",
  "target",
  "rest",
  "rpe",
  "load",
  "taperCompatible",
  "trainingPhase",
  "primaryGoal",
  "drillRefs",
  "blockRefs",
  "exerciseRefs",
]);

describe("inventory content mapping", () => {
  const inventory = readInventory();

  it("keeps every non-empty content field and drops empty strings and arrays", () => {
    const rows = allRows(inventory);
    expect(rows).toHaveLength(257);
    for (const { kind, record } of rows) {
      const mapped = mapInventoryRecordToCatalogContent(kind, record);
      expect(mapped).toEqual(expectedContent(kind, record));
      const allowedLegacy = new Set([...LEGACY_FIELDS[kind], ...Object.keys(record.legacyAttributes)]);
      for (const key of Object.keys(mapped.legacyAttributes)) {
        expect(allowedLegacy.has(key), `${record.id} legacy ${key}`).toBe(true);
      }
      for (const [key, value] of Object.entries(record.legacyAttributes)) {
        expect(mapped.legacyAttributes[key]).toEqual(value);
      }
      for (const [key, value] of Object.entries(record)) {
        if (key === "id" || key === "legacyAttributes" || PROVENANCE.has(key)) continue;
        expect(CONTENT_FIELDS.has(key), `${record.id} unknown field ${key}`).toBe(true);
        if (isDiscarded(value)) {
          expect(Object.prototype.hasOwnProperty.call(mapped.legacyAttributes, key)).toBe(false);
        } else {
          expect(fieldLanded(kind, record, mapped, key, value), `${record.id} ${key}`).toBe(true);
        }
      }
      expect(mapped.legacyAttributes.source).toBeUndefined();
      expect(mapped.legacyAttributes.exerciseRefsSource).toBeUndefined();
    }
  });

  it("keeps the four conditional safety inputs in legacyAttributes", () => {
    const wanted = new Set(["EX-L039", "EX-L078", "EX-L079", "EX-L080"]);
    const found = inventory.objects.exercises.filter((record) => wanted.has(record.id));
    expect(found.map((record) => record.id).sort()).toEqual([...wanted].sort());
    for (const record of found) {
      const mapped = mapInventoryRecordToCatalogContent("exercise", record);
      expect(mapped.legacyAttributes.youthDefault).toBe("Conditional");
      expect(mapped.legacyAttributes.supervision).toBe("Qualified adult/coach");
      expect(mapped.legacyAttributes.safetyFlag).toBe("review_required");
    }
  });

  it("preserves null legacy values from the workbook", () => {
    for (const id of ["BL-L031", "BL-I017"]) {
      const record = inventory.objects.blocks.find((row) => row.id === id);
      expect(record?.legacyAttributes.systemTemplateId).toBeNull();
      const mapped = mapInventoryRecordToCatalogContent("block", record as InventoryRecord);
      expect(mapped.legacyAttributes.systemTemplateId).toBeNull();
    }
  });

  it("throws when a mapped field collides with an existing legacy key", () => {
    const record: InventoryRecord = {
      id: "EX-1",
      nameZh: "甲",
      nameEn: "A",
      environment: "ice",
      legacyAttributes: { environment: "dry" },
    };
    expect(() => mapInventoryRecordToCatalogContent("exercise", record)).toThrow(/environment/);
  });
});

function expectedContent(kind: CatalogKind, record: InventoryRecord): CatalogContent {
  const objectiveIds = [record.primaryObjectiveId, ...(record.secondaryObjectiveIds ?? [])].filter(
    (item): item is string => typeof item === "string" && item !== "",
  );
  const taxonomy: CatalogContent["taxonomy"] = { objectiveIds };
  if (typeof record.sectionId === "string" && record.sectionId !== "") taxonomy.sectionId = record.sectionId;
  if (typeof record.energySystemId === "string" && record.energySystemId !== "") {
    taxonomy.energySystemId = record.energySystemId;
  }
  if (typeof record.modality === "string" && record.modality !== "") taxonomy.modality = record.modality;
  const legacyAttributes: Record<string, unknown> = {};
  for (const field of LEGACY_FIELDS[kind]) {
    const value = record[field as keyof InventoryRecord];
    if (typeof value === "string" && value !== "") legacyAttributes[field] = value;
  }
  for (const [key, value] of Object.entries(record.legacyAttributes)) {
    legacyAttributes[key] = value;
  }
  const refIds = record[REF_FIELD[kind]] ?? [];
  return {
    localeContent: { zh: { name: record.nameZh }, en: { name: record.nameEn } },
    taxonomy,
    refs: refIds.filter((id) => id !== "").map((id) => ({ id, contentVersion: "v1" })),
    legacyAttributes,
  };
}

function fieldLanded(
  kind: CatalogKind,
  record: InventoryRecord,
  mapped: CatalogContent,
  key: string,
  value: unknown,
): boolean {
  if (key === "nameZh") return mapped.localeContent.zh.name === value;
  if (key === "nameEn") return mapped.localeContent.en.name === value;
  if (key === "sectionId") return mapped.taxonomy.sectionId === value;
  if (key === "primaryObjectiveId" || key === "secondaryObjectiveIds") {
    return JSON.stringify(mapped.taxonomy.objectiveIds) === JSON.stringify(expectedContent(kind, record).taxonomy.objectiveIds);
  }
  if (key === "modality") return mapped.taxonomy.modality === value;
  if (key === "energySystemId") return mapped.taxonomy.energySystemId === value;
  if (key === "drillRefs" || key === "blockRefs" || key === "exerciseRefs") {
    return JSON.stringify(mapped.refs) === JSON.stringify(expectedContent(kind, record).refs);
  }
  if (LEGACY_FIELDS[kind].includes(key)) return mapped.legacyAttributes[key] === value;
  return false;
}

function isDiscarded(value: unknown): boolean {
  return value === "" || (Array.isArray(value) && value.length === 0) || value === undefined;
}

function allRows(inventory: InventoryFile): { kind: CatalogKind; record: InventoryRecord }[] {
  const rows: { kind: CatalogKind; record: InventoryRecord }[] = [];
  for (const [sheet, kind] of Object.entries(SHEETS) as Array<[keyof typeof SHEETS, CatalogKind]>) {
    for (const record of inventory.objects[sheet]) rows.push({ kind, record });
  }
  return rows;
}

interface InventoryFile {
  objects: Record<(typeof SHEETS)[keyof typeof SHEETS] extends never ? never : "exercises" | "drills" | "blocks" | "sessions", InventoryRecord[]>;
}

function readInventory(): {
  objects: {
    exercises: InventoryRecord[];
    drills: InventoryRecord[];
    blocks: InventoryRecord[];
    sessions: InventoryRecord[];
  };
} {
  const inventoryPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../docs/skatingx-v2/inventory/workbook-inventory.json",
  );
  const parsed: unknown = JSON.parse(readFileSync(inventoryPath, "utf8"));
  if (!isInventory(parsed)) {
    throw new Error("workbook inventory is not the expected object shape");
  }
  return parsed;
}

function isInventory(value: unknown): value is {
  objects: {
    exercises: InventoryRecord[];
    drills: InventoryRecord[];
    blocks: InventoryRecord[];
    sessions: InventoryRecord[];
  };
} {
  if (value === null || typeof value !== "object" || !("objects" in value)) return false;
  const objects = (value as { objects?: unknown }).objects;
  if (objects === null || typeof objects !== "object") return false;
  const record = objects as Record<string, unknown>;
  return ["exercises", "drills", "blocks", "sessions"].every((key) => Array.isArray(record[key]));
}
