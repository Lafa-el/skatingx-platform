import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CatalogKind } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import type { CatalogObject, CatalogVersion } from "./catalog-object";
import { CATALOG_SCHEMA_VERSION } from "./catalog-object";
import {
  checkPublishedBinding,
  findCatalogCycles,
  validateCatalogLocales,
  validateCatalogRefs,
  validateCatalogShape,
  type CatalogGraphNode,
} from "./validate";

function node(id: string, kind: CatalogKind, refIds: readonly string[]): CatalogGraphNode {
  return {
    id,
    kind,
    refs: refIds.map((refId) => ({ id: refId, contentVersion: "v1" })),
  };
}

function versionsOf(ids: readonly string[]): Map<string, ReadonlySet<string>> {
  return new Map(ids.map((id) => [id, new Set(["v1"])]));
}

describe("validateCatalogRefs", () => {
  const session = node("S", "session", ["B"]);
  const block = node("B", "block", ["D"]);
  const drill = node("D", "drill", ["E"]);
  const exercise = node("E", "exercise", []);
  const legal = [session, block, drill, exercise];

  it("accepts a session to block to drill to exercise graph", () => {
    expect(validateCatalogRefs(legal, versionsOf(["S", "B", "D", "E"]))).toEqual([]);
  });

  it("reports an unknown id", () => {
    const broken = [node("B", "block", ["missing"])];
    expect(validateCatalogRefs(broken, versionsOf(["B"]))).toEqual([
      { kind: "unknown-id", fromId: "B", refId: "missing", refVersion: "v1" },
    ]);
  });

  it("reports a version that is not in the known set", () => {
    const broken = node("B", "block", ["D"]);
    const drillOnly = node("D", "drill", []);
    const known = new Map<string, ReadonlySet<string>>([["D", new Set(["v2"])]]);
    expect(validateCatalogRefs([broken, drillOnly], known)).toEqual([
      { kind: "unknown-version", fromId: "B", refId: "D", refVersion: "v1" },
    ]);
  });

  it("reports a block citing a session and a session citing a drill", () => {
    const nodes = [node("B", "block", ["S"]), node("S", "session", ["D"]), node("D", "drill", [])];
    expect(validateCatalogRefs(nodes, versionsOf(["B", "S", "D"]))).toEqual([
      { kind: "wrong-kind", fromId: "B", refId: "S", refVersion: "v1" },
      { kind: "wrong-kind", fromId: "S", refId: "D", refVersion: "v1" },
    ]);
  });

  it("does not treat a repeated ref as an error", () => {
    const blockTwice = node("B", "block", ["D", "D"]);
    const drillOnly = node("D", "drill", []);
    expect(validateCatalogRefs([blockTwice, drillOnly], versionsOf(["B", "D"]))).toEqual([]);
  });
});

describe("findCatalogCycles", () => {
  it("finds a two-node cycle starting at the smaller id", () => {
    const nodes = [node("b", "block", ["a"]), node("a", "drill", ["b"])];
    expect(findCatalogCycles(nodes)).toEqual([["a", "b"]]);
  });

  it("treats a self-reference as a cycle", () => {
    expect(findCatalogCycles([node("a", "drill", ["a"])])).toEqual([["a"]]);
  });

  it("finds a three-node cycle", () => {
    const nodes = [
      node("c", "session", ["a"]),
      node("a", "block", ["b"]),
      node("b", "drill", ["c"]),
    ];
    expect(findCatalogCycles(nodes)).toEqual([["a", "b", "c"]]);
  });

  it("finds no cycle in a diamond", () => {
    const nodes = [
      node("a", "session", ["b", "c"]),
      node("b", "block", ["d"]),
      node("c", "block", ["d"]),
      node("d", "drill", []),
    ];
    expect(findCatalogCycles(nodes)).toEqual([]);
  });

  it("finds no cycle in a session to block to drill chain", () => {
    const nodes = [
      node("S", "session", ["B"]),
      node("B", "block", ["D"]),
      node("D", "drill", []),
    ];
    expect(findCatalogCycles(nodes)).toEqual([]);
  });
});

describe("validateCatalogLocales", () => {
  const base = {
    id: "EX-1",
    localeContent: {
      zh: { name: "下落跳" },
      en: { name: "Drop Jump" },
    },
  };

  it("accepts names and ignores a missing description", () => {
    expect(validateCatalogLocales(base)).toEqual([]);
  });

  it("rejects a missing, empty, or blank name in either locale", () => {
    expect(validateCatalogLocales({ ...base, localeContent: { zh: { name: "" }, en: { name: "Drop Jump" } } })).toEqual([
      "EX-1: localeContent.zh.name is empty",
    ]);
    expect(validateCatalogLocales({ ...base, localeContent: { zh: { name: "   " }, en: { name: "Drop Jump" } } })).toEqual([
      "EX-1: localeContent.zh.name is empty",
    ]);
    const missingZh = {
      id: "EX-1",
      localeContent: { en: { name: "Drop Jump" } },
    } as Pick<CatalogObject, "id" | "localeContent">;
    expect(validateCatalogLocales(missingZh)).toEqual(["EX-1: localeContent.zh.name is empty"]);
    expect(validateCatalogLocales({ ...base, localeContent: { zh: { name: "下落跳" }, en: { name: "" } } })).toEqual([
      "EX-1: localeContent.en.name is empty",
    ]);
  });
});

describe("validateCatalogShape", () => {
  it("rejects an unknown top-level key and accepts a clean object", () => {
    expect(validateCatalogShape({ id: "EX-1", extraColumn: "nope" })).toEqual([
      "extraColumn is not a CatalogObject field",
    ]);
    expect(validateCatalogShape({ id: "EX-1", kind: "exercise", legacyAttributes: {} })).toEqual([]);
  });
});

interface InventoryRow {
  id: string;
  nameZh: string;
  nameEn: string;
  legacyAttributes: Record<string, unknown>;
  drillRefs?: string[];
  blockRefs?: string[];
  exerciseRefs?: string[];
  exerciseRefsSource?: string;
}

interface InventoryFile {
  objects: {
    exercises: InventoryRow[];
    drills: InventoryRow[];
    blocks: InventoryRow[];
    sessions: InventoryRow[];
  };
}

const INVENTORY_KIND = {
  exercises: "exercise",
  drills: "drill",
  blocks: "block",
  sessions: "session",
} as const;

const LEGACY_KEYS: Record<CatalogKind, ReadonlySet<string>> = {
  exercise: new Set(),
  drill: new Set(["Development", "Notes", "Quality Rule"]),
  block: new Set(["Development", "Notes", "Source", "systemTemplateId"]),
  session: new Set(["Development", "Notes"]),
};

describe("workbook inventory graph", () => {
  const inventory = readInventory();

  it("resolves the published block and session refs and has no cycle", () => {
    const nodes: CatalogGraphNode[] = [];
    let blockToDrill = 0;
    let sessionToBlock = 0;
    for (const [sheet, kind] of Object.entries(INVENTORY_KIND) as Array<
      [keyof typeof INVENTORY_KIND, CatalogKind]
    >) {
      for (const row of inventory.objects[sheet]) {
        const refIds = kind === "block" ? (row.drillRefs ?? []) : kind === "session" ? (row.blockRefs ?? []) : [];
        if (kind === "block") blockToDrill += refIds.length;
        if (kind === "session") sessionToBlock += refIds.length;
        nodes.push(node(row.id, kind, refIds));
      }
    }

    expect(nodes).toHaveLength(257);
    expect(new Set(nodes.map((item) => item.id)).size).toBe(257);
    expect(blockToDrill).toBe(115);
    expect(sessionToBlock).toBe(57);
    const known = versionsOf(nodes.map((item) => item.id));
    expect(validateCatalogRefs(nodes, known)).toEqual([]);
    expect(findCatalogCycles(nodes)).toEqual([]);
  });

  it("keeps every drill free of an inferred exercise edge", () => {
    expect(inventory.objects.drills).toHaveLength(68);
    for (const drill of inventory.objects.drills) {
      expect(drill.exerciseRefs).toEqual([]);
      expect(drill.exerciseRefsSource).toBe("source_not_provided");
    }
  });

  it("requires a non-empty bilingual name on every record", () => {
    const rows = [
      ...inventory.objects.exercises,
      ...inventory.objects.drills,
      ...inventory.objects.blocks,
      ...inventory.objects.sessions,
    ];
    expect(rows).toHaveLength(257);
    for (const row of rows) {
      expect(row.nameZh.trim()).not.toBe("");
      expect(row.nameEn.trim()).not.toBe("");
    }
  });

  it("keeps legacyAttributes keys inside the per-kind set", () => {
    for (const [sheet, kind] of Object.entries(INVENTORY_KIND) as Array<
      [keyof typeof INVENTORY_KIND, CatalogKind]
    >) {
      const allowed = LEGACY_KEYS[kind];
      for (const row of inventory.objects[sheet]) {
        for (const key of Object.keys(row.legacyAttributes)) {
          expect(allowed.has(key), `${row.id} legacy key ${key}`).toBe(true);
        }
      }
    }
  });
});

function readInventory(): InventoryFile {
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

function isInventory(value: unknown): value is InventoryFile {
  if (value === null || typeof value !== "object" || !("objects" in value)) return false;
  const objects = (value as { objects?: unknown }).objects;
  if (objects === null || typeof objects !== "object") return false;
  const record = objects as Record<string, unknown>;
  return ["exercises", "drills", "blocks", "sessions"].every((key) => Array.isArray(record[key]));
}

describe("checkPublishedBinding", () => {
  const content = {
    localeContent: { zh: { name: "下落跳" }, en: { name: "Drop Jump" } },
    taxonomy: { sectionId: "LAND", objectiveIds: ["OBJ15"] },
    refs: [] as CatalogObject["refs"],
    legacyAttributes: { supervision: "Qualified adult/coach" },
  };

  function parent(overrides: Partial<CatalogObject> = {}): CatalogObject {
    return {
      id: "EX-1",
      kind: "exercise",
      sportId: "short_track",
      ...content,
      schemaVersion: CATALOG_SCHEMA_VERSION,
      contentVersion: "v1",
      status: "published",
      reviewStatus: "approved",
      createdAt: "2026-11-12T00:00:00.000Z",
      updatedAt: "2026-11-12T00:00:00.000Z",
      checksum: "abc",
      publishedVersion: "v1",
      reviewer: "reviewer-1",
      reviewedAt: "2026-11-12T00:00:00.000Z",
      ...overrides,
    };
  }

  function version(overrides: Partial<CatalogVersion> = {}): CatalogVersion {
    return {
      contentVersion: "v1",
      status: "published",
      reviewStatus: "approved",
      reviewer: "reviewer-1",
      reviewedAt: "2026-11-12T00:00:00.000Z",
      checksum: "abc",
      ...content,
      schemaVersion: CATALOG_SCHEMA_VERSION,
      ...overrides,
    };
  }

  it("accepts a parent bound to its published snapshot", () => {
    expect(checkPublishedBinding(parent(), version())).toEqual([]);
  });

  it("reports each broken binding on its own", () => {
    expect(checkPublishedBinding(parent({ status: "draft" }), version())).toContain("parent status is not published");
    expect(checkPublishedBinding(parent({ publishedVersion: "v2" }), version())).toContain(
      "publishedVersion does not match contentVersion",
    );
    expect(checkPublishedBinding(parent({ checksum: "other" }), version())).toContain("checksum does not match");
    expect(checkPublishedBinding(parent(), version({ status: "draft" }))).toContain("version status is not published");
    expect(checkPublishedBinding(parent(), version({ reviewStatus: "pending" }))).toContain(
      "version reviewStatus is not approved",
    );
    expect(
      checkPublishedBinding(
        parent({ localeContent: { zh: { name: "其他" }, en: { name: "Other" } } }),
        version(),
      ),
    ).toContain("content fields do not match");
  });

  it("rejects a withdrawn parent whose pointer was cleared", () => {
    const withdrawn = parent({ status: "deprecated" });
    delete withdrawn.publishedVersion;
    const errors = checkPublishedBinding(withdrawn, version());
    expect(errors).toContain("parent status is not published");
    expect(errors).toContain("publishedVersion does not match contentVersion");
  });

  it("reports version identity and review-record mismatches", () => {
    expect(checkPublishedBinding(parent({ schemaVersion: 2 }), version())).toContain("schemaVersion does not match");
    expect(checkPublishedBinding(parent({ supersedesVersion: "v0" }), version({ supersedesVersion: "v1" }))).toContain(
      "supersedesVersion does not match",
    );
    expect(checkPublishedBinding(parent({ supersedesVersion: "v0" }), version())).toContain(
      "supersedesVersion does not match",
    );
    expect(checkPublishedBinding(parent(), version({ supersedesVersion: "v0" }))).toContain(
      "supersedesVersion does not match",
    );
    expect(checkPublishedBinding(parent({ contentVersion: "v2" }), version())).toContain(
      "parent contentVersion does not match contentVersion",
    );
    expect(checkPublishedBinding(parent(), version({ reviewer: undefined }))).toContain(
      "version review record is incomplete",
    );
    expect(checkPublishedBinding(parent(), version({ reviewedAt: undefined }))).toContain(
      "version review record is incomplete",
    );
    expect(checkPublishedBinding(parent({ reviewer: "other" }), version())).toContain("reviewer does not match");
    expect(checkPublishedBinding(parent({ reviewedAt: "2026-11-13T00:00:00.000Z" }), version())).toContain(
      "reviewedAt does not match",
    );
    expect(checkPublishedBinding(parent({ reviewStatus: "pending" }), version())).toContain(
      "parent reviewStatus is not approved",
    );
    const forged = checkPublishedBinding(
      parent({
        checksum: "forged",
        localeContent: { zh: { name: "其他" }, en: { name: "Other" } },
      }),
      version({ checksum: "forged" }),
    );
    expect(forged).toContain("content fields do not match");
    expect(forged).not.toContain("checksum does not match");
  });
});
