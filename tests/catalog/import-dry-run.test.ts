import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { doc, getDoc } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import type { CatalogKind } from "@skatingx/schema";
import {
  CATALOG_SCHEMA_VERSION,
  type CatalogChecksumInput,
  type CatalogObject,
  canonicalCatalogJson,
  contentChecksumPayload,
  findCatalogCycles,
  INITIAL_REVIEW_STATUS,
} from "@skatingx/training-catalog";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum";
import {
  CONTENT_VERSION,
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  auditDocId,
  beginRun,
  documentData,
  dumpCatalog,
  importDocuments,
  loadPlans,
  readPlannedDocs,
  rollbackImport,
} from "../../scripts/catalog/import-core.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const MIGRATIONS = `${ROOT}/trainingCatalogMigrations`;
const DRY_RUN_ID = "dry-run";
const COLLECTIONS = [
  "trainingCatalogObjects",
  "trainingCatalogKnowledgeArticles",
  "trainingCatalogEvidenceRecords",
  "trainingCatalogTeachingMedia",
  "trainingCatalogCorrectionRules",
  "trainingCatalogSafetyPolicies",
  "trainingCatalogLinks",
  "trainingCatalogReleases",
  "trainingCatalogMigrations",
  "trainingCatalogAuditLogs",
  "trainingCatalogPublicLinks",
] as const;

const EXPECTED_COUNTS: Record<CatalogKind, number> = {
  exercise: 120,
  drill: 68,
  block: 51,
  session: 18,
};
const EXPECTED_BLOCK_REFS = 115;
const EXPECTED_SESSION_REFS = 57;
const CONDITIONAL_IDS = ["EX-L039", "EX-L078", "EX-L079", "EX-L080"] as const;
const CONDITIONAL_SAFETY = {
  youthDefault: "Conditional",
  supervision: "Qualified adult/coach",
  safetyFlag: "review_required",
} as const;

const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const reportPath = path.join(rootDir, "docs/skatingx-v2/import/dry-run-report.json");

interface DryRunReport {
  workbookSha256: string;
  projectId: string;
  gitHead: string;
  counts: {
    parents: number;
    versions: number;
    exercise: number;
    drill: number;
    block: number;
    session: number;
    refs: number;
    blockToDrill: number;
    sessionToBlock: number;
  };
  checks: Record<string, "pass" | "fail">;
  writes: { firstPass: number; secondPass: number };
  remainingAfterRollback: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCatalogKind(value: unknown): value is CatalogKind {
  return value === "exercise" || value === "drill" || value === "block" || value === "session";
}

function assertCanonicalEqual(label: string, actual: unknown, expected: unknown): void {
  const left = canonicalCatalogJson(actual);
  const right = canonicalCatalogJson(expected);
  if (left === right) return;
  throw new Error(
    `canonical mismatch at ${label}: ${left.slice(0, 180)} !== ${right.slice(0, 180)}`,
  );
}

function checksumOf(data: Record<string, unknown>): string {
  const input: CatalogChecksumInput = {
    localeContent: data.localeContent as CatalogChecksumInput["localeContent"],
    taxonomy: data.taxonomy as CatalogChecksumInput["taxonomy"],
    refs: data.refs as CatalogChecksumInput["refs"],
    legacyAttributes: isRecord(data.legacyAttributes) ? data.legacyAttributes : {},
    schemaVersion: data.schemaVersion as number,
  };
  if (typeof data.supersedesVersion === "string") {
    input.supersedesVersion = data.supersedesVersion;
  }
  return computeCatalogChecksum(contentChecksumPayload(input));
}

function payloadJson(data: Record<string, unknown>): string {
  const input: CatalogChecksumInput = {
    localeContent: data.localeContent as CatalogChecksumInput["localeContent"],
    taxonomy: data.taxonomy as CatalogChecksumInput["taxonomy"],
    refs: data.refs as CatalogChecksumInput["refs"],
    legacyAttributes: isRecord(data.legacyAttributes) ? data.legacyAttributes : {},
    schemaVersion: data.schemaVersion as number,
  };
  if (typeof data.supersedesVersion === "string") input.supersedesVersion = data.supersedesVersion;
  return canonicalCatalogJson(contentChecksumPayload(input));
}

function emulatorAddress(): { host: string; port: number } {
  const raw = process.env.FIRESTORE_EMULATOR_HOST;
  if (!raw) throw new Error("FIRESTORE_EMULATOR_HOST is required");
  const colon = raw.lastIndexOf(":");
  const port = Number(raw.slice(colon + 1));
  if (colon <= 0 || !Number.isInteger(port)) {
    throw new Error(`FIRESTORE_EMULATOR_HOST is not host:port (${raw})`);
  }
  return { host: raw.slice(0, colon), port };
}

async function wipeCatalog(db: Firestore): Promise<void> {
  const paths: string[] = [];
  for (const name of COLLECTIONS) {
    const snap = await db.collection(`${ROOT}/${name}`).get();
    for (const item of snap.docs) paths.push(item.ref.path);
  }
  const refs = await db.collection(OBJECTS).listDocuments();
  for (const ref of refs) {
    const versions = await db.collection(`${ref.path}/versions`).get();
    for (const item of versions.docs) paths.push(item.ref.path);
  }
  const unique = [...new Set(paths)];
  for (let index = 0; index < unique.length; index += 400) {
    const batch = db.batch();
    for (const docPath of unique.slice(index, index + 400)) batch.delete(db.doc(docPath));
    await batch.commit();
  }
}

function openFirestore(): Firestore {
  if (!PROJECT_ID.startsWith("demo-")) {
    throw new Error(`refusing to run: project id ${PROJECT_ID} is not a demo- project`);
  }
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("refusing to run: FIRESTORE_EMULATOR_HOST is not set");
  }
  const existing = getApps().find((app) => app.name === "catalog-import-dry-run");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-import-dry-run");
  return getFirestore(app);
}

function gitHead(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
}

function writeReport(report: DryRunReport): void {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

describe("catalog import dry run", () => {
  it("imports the committed inventory, checks it, and rolls the emulator back", async () => {
    const report: DryRunReport = {
      workbookSha256: "",
      projectId: PROJECT_ID,
      gitHead: gitHead(),
      counts: {
        parents: 0,
        versions: 0,
        exercise: 0,
        drill: 0,
        block: 0,
        session: 0,
        refs: 0,
        blockToDrill: 0,
        sessionToBlock: 0,
      },
      checks: {},
      writes: { firstPass: -1, secondPass: -1 },
      remainingAfterRollback: -1,
    };
    let current = "";
    const mark = (name: string): void => {
      current = name;
      report.checks[name] = "pass";
    };

    try {
      mark("emulatorGuard");
      expect(PROJECT_ID.startsWith("demo-")).toBe(true);
      expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
      expect(CATALOG_SCHEMA_VERSION).toBe(1);
      expect(INITIAL_REVIEW_STATUS).toBe("pending");

      const db = openFirestore();
      // Catalog files share one emulator. Clear anything an earlier file left
      // behind so this import starts from the committed inventory.
      await wipeCatalog(db);
      mark("workbookSha256");
      const run = await beginRun(db, { runId: DRY_RUN_ID, workbookSha256: EXPECTED_WORKBOOK_SHA256 });
      const { workbookSha256, plans } = loadPlans(run.importedAt);
      report.workbookSha256 = workbookSha256;
      const runContext = { runId: run.runId, importedAt: run.importedAt, actor: IMPORT_ACTOR };

      mark("firstImport");
      report.writes.firstPass = await importDocuments(db, plans, runContext);
      expect(report.writes.firstPass).toBe(514);
      const stored = await readPlannedDocs(db, plans);

      mark("counts");
      const parents = [...stored.entries()].filter(([docPath]) => !docPath.includes("/versions/"));
      const versions = [...stored.entries()].filter(([docPath]) => docPath.endsWith(`/versions/${CONTENT_VERSION}`));
      expect(parents).toHaveLength(257);
      expect(versions).toHaveLength(257);
      expect(stored.size).toBe(514);
      const kindCounts: Record<CatalogKind, number> = { exercise: 0, drill: 0, block: 0, session: 0 };
      for (const [, data] of parents) {
        expect(isCatalogKind(data.kind)).toBe(true);
        if (isCatalogKind(data.kind)) kindCounts[data.kind] += 1;
      }
      expect(kindCounts).toEqual(EXPECTED_COUNTS);
      report.counts = {
        ...report.counts,
        parents: parents.length,
        versions: versions.length,
        ...kindCounts,
      };

      mark("checksums");
      const parentById = new Map<string, Record<string, unknown>>();
      for (const [docPath, data] of parents) {
        expect(checksumOf(data)).toBe(data.checksum);
        expect(data.contentVersion).toBe(CONTENT_VERSION);
        expect(data.status).toBe("draft");
        expect(data.reviewStatus).toBe("pending");
        expect(data.sportId).toBe("short_track");
        expect(data.schemaVersion).toBe(1);
        expect(data).not.toHaveProperty("sourceLegacyId");
        expect(data).not.toHaveProperty("supersedesVersion");
        expect(data).not.toHaveProperty("publishedVersion");
        expect(data).not.toHaveProperty("reviewer");
        expect(data).not.toHaveProperty("reviewedAt");
        expect(data).not.toHaveProperty("source");
        expect(data).not.toHaveProperty("exerciseRefsSource");
        const legacy = data.legacyAttributes;
        expect(isRecord(legacy)).toBe(true);
        expect(legacy).not.toHaveProperty("source");
        expect(legacy).not.toHaveProperty("exerciseRefsSource");
        parentById.set(docPath.slice(OBJECTS.length + 1), data);
      }

      mark("snapshots");
      for (const [docPath, data] of versions) {
        const parentId = docPath.slice(OBJECTS.length + 1, docPath.indexOf("/versions/"));
        const parent = parentById.get(parentId);
        expect(parent).toBeDefined();
        expect(data.checksum).toBe(parent?.checksum);
        expect(payloadJson(data)).toBe(payloadJson(parent ?? {}));
        expect(data).not.toHaveProperty("reviewer");
        expect(data).not.toHaveProperty("reviewedAt");
        expect(data).not.toHaveProperty("source");
        expect(data).not.toHaveProperty("exerciseRefsSource");
      }

      mark("canonicalFidelity");
      for (const plan of plans) {
        const actual = stored.get(plan.path);
        expect(actual).toBeDefined();
        assertCanonicalEqual(plan.path, actual, documentData(plan.data));
      }

      mark("refs");
      let blockToDrill = 0;
      let sessionToBlock = 0;
      let otherRefs = 0;
      const nodes = [...parentById.entries()].map(([id, data]) => {
        if (!isCatalogKind(data.kind) || !Array.isArray(data.refs)) {
          throw new Error(`parent ${id} has no catalog refs`);
        }
        return { id, kind: data.kind, refs: data.refs as CatalogObject["refs"] };
      });
      for (const node of nodes) {
        for (const ref of node.refs) {
          if (node.kind === "block") blockToDrill += 1;
          else if (node.kind === "session") sessionToBlock += 1;
          else otherRefs += 1;
          const target = parentById.get(ref.id);
          expect(target, ref.id).toBeDefined();
          expect(ref.contentVersion).toBe(CONTENT_VERSION);
          expect(target?.contentVersion).toBe(CONTENT_VERSION);
        }
        if (node.kind === "drill") expect(node.refs).toEqual([]);
      }
      expect(nodes.filter((node) => node.kind === "drill")).toHaveLength(68);
      expect(blockToDrill).toBe(EXPECTED_BLOCK_REFS);
      expect(sessionToBlock).toBe(EXPECTED_SESSION_REFS);
      expect(otherRefs).toBe(0);
      expect(blockToDrill + sessionToBlock).toBe(172);
      report.counts.refs = 172;
      report.counts.blockToDrill = blockToDrill;
      report.counts.sessionToBlock = sessionToBlock;

      mark("cycles");
      expect(findCatalogCycles(nodes)).toEqual([]);

      mark("conditionalSafety");
      for (const id of CONDITIONAL_IDS) {
        const legacy = parentById.get(id)?.legacyAttributes;
        expect(isRecord(legacy)).toBe(true);
        expect(legacy).toMatchObject(CONDITIONAL_SAFETY);
      }

      mark("idempotent");
      const before = dumpCatalog(stored);
      report.writes.secondPass = await importDocuments(db, plans, runContext);
      const afterDocs = await readPlannedDocs(db, plans);
      expect(report.writes.secondPass).toBe(0);
      expect(dumpCatalog(afterDocs)).toBe(before);

      mark("rulesSpotCheck");
      const { host, port } = emulatorAddress();
      const rules = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { host, port },
      });
      try {
        const draftPath = `${OBJECTS}/EX-L039`;
        const adminDb = rules.authenticatedContext("catalog-admin", { catalogAdmin: true }).firestore();
        await assertSucceeds(getDoc(doc(adminDb, draftPath)));
        const anon = rules.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(anon, draftPath)));
      } finally {
        await rules.cleanup();
      }

      mark("rollback");
      await rollbackImport(db, run.runId);
      const remaining = await readPlannedDocs(db, plans);
      report.remainingAfterRollback = remaining.size;
      expect(remaining.size).toBe(0);
      const parentIds = plans
        .filter((plan) => !plan.path.includes("/versions/"))
        .map((plan) => plan.path.slice(OBJECTS.length + 1));
      expect(parentIds).toHaveLength(257);
      const audits = await readPlannedDocs(
        db,
        parentIds.map((id) => ({ path: `${AUDIT}/${auditDocId(run.runId, id)}` })),
      );
      expect(audits.size).toBe(257);
      for (const data of audits.values()) {
        expect(data.action).toBe("import");
        expect(data.result).toBe("ok");
        expect(data.runId).toBe(run.runId);
      }
      const migration = (await db.doc(`${MIGRATIONS}/${run.runId}`).get()).data();
      expect(migration?.status).toBe("rolled_back");
      expect(typeof migration?.rolledBackAt).toBe("string");
    } catch (error) {
      if (current) report.checks[current] = "fail";
      writeReport(report);
      throw error;
    }

    writeReport(report);
  });
});
