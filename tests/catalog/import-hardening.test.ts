import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import { canonicalCatalogJson } from "@skatingx/training-catalog";
import {
  CONTENT_VERSION,
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  auditDocId,
  beginRun,
  dumpCatalog,
  importDocuments,
  importLockPath,
  loadPlans,
  planBatches,
  preflightInitial,
  readPlannedDocs,
  rollbackImport,
} from "../../scripts/catalog/import-core.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const runImportPath = path.join(rootDir, "scripts/catalog/run-import.mjs");

const SENTINELS = [
  { path: "users/sentinel-user/versions/v1", data: { marker: "user-sentinel", n: 1 } },
  { path: "legacy-imports/not-catalog/versions/v1", data: { marker: "other-sentinel", n: 2 } },
] as const;

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-import-hardening");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-import-hardening");
  return getFirestore(app);
}

function contextOf(run: { runId: string; importedAt: string; actor?: string; lockToken?: string }) {
  return {
    runId: run.runId,
    importedAt: run.importedAt,
    actor: run.actor ?? IMPORT_ACTOR,
    lockToken: run.lockToken ?? "",
  };
}

function fakePlans(count: number) {
  const plans = [];
  for (let index = 0; index < count; index += 1) {
    const id = `OBJ-${index}`;
    const parent = { id, checksum: `sum-${index}`, contentVersion: CONTENT_VERSION };
    plans.push({ path: `${OBJECTS}/${id}`, data: parent });
    plans.push({
      path: `${OBJECTS}/${id}/versions/${CONTENT_VERSION}`,
      data: { checksum: parent.checksum, contentVersion: CONTENT_VERSION },
    });
  }
  return plans;
}

function runImport(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [runImportPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env,
  });
}

async function wipeCatalog(db: Firestore): Promise<void> {
  const names = [
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
  ];
  const paths: string[] = [];
  for (const name of names) {
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

describe.sequential("catalog import hardening", () => {
  const db = openFirestore();

  beforeAll(async () => {
    await wipeCatalog(db);
  });

  it("keeps every batch inside the write limit and does not split an object", () => {
    const plans = fakePlans(134);
    const batches = planBatches(plans, "run-plan", { actor: IMPORT_ACTOR, importedAt: "2026-11-13T00:00:00.000Z" });
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(399);
    expect(batches[1]).toHaveLength(3);
    const seen = new Map<string, number>();
    batches.forEach((batch, batchIndex) => {
      expect(batch.length).toBeLessThanOrEqual(400);
      expect(batch.length % 3).toBe(0);
      for (let index = 0; index < batch.length; index += 3) {
        const triple = batch.slice(index, index + 3);
        const objectId = triple[0]?.path.slice(OBJECTS.length + 1);
        expect(triple.map((doc) => doc.path)).toEqual([
          `${OBJECTS}/${objectId}`,
          `${OBJECTS}/${objectId}/versions/${CONTENT_VERSION}`,
          `${AUDIT}/imp-run-plan-${objectId}`,
        ]);
        expect(seen.has(objectId ?? "")).toBe(false);
        seen.set(objectId ?? "", batchIndex);
      }
    });
    expect(seen.size).toBe(134);
  });

  it("leaves non-catalog version documents unchanged through import and rollback", async () => {
    expect(PROJECT_ID.startsWith("demo-")).toBe(true);
    for (const sentinel of SENTINELS) {
      await db.doc(sentinel.path).set({ ...sentinel.data });
    }
    const before = new Map<string, string>();
    for (const sentinel of SENTINELS) {
      const data = (await db.doc(sentinel.path).get()).data();
      before.set(sentinel.path, canonicalCatalogJson(data));
    }

    const run = await beginRun(db, { runId: "run-sentinel", workbookSha256: EXPECTED_WORKBOOK_SHA256 });
    const { plans } = loadPlans(run.importedAt);
    expect(await importDocuments(db, plans, contextOf(run))).toBe(514);
    await rollbackImport(db, run.runId, { lockToken: run.lockToken ?? "" });
    expect((await readPlannedDocs(db, plans)).size).toBe(0);

    for (const sentinel of SENTINELS) {
      const data = (await db.doc(sentinel.path).get()).data();
      expect(canonicalCatalogJson(data)).toBe(before.get(sentinel.path));
    }
  });

  it("imports once and writes nothing when a new process reuses the run id", async () => {
    const run = await beginRun(db, { runId: "run-idempotent", workbookSha256: EXPECTED_WORKBOOK_SHA256 });
    const { plans } = loadPlans(run.importedAt);
    expect(await importDocuments(db, plans, contextOf(run))).toBe(514);
    const content = dumpCatalog(await readPlannedDocs(db, plans));
    const parentIds = plans
      .filter((plan) => !plan.path.includes("/versions/"))
      .map((plan) => plan.path.slice(OBJECTS.length + 1));
    const auditPlans = parentIds.map((id) => ({ path: `${AUDIT}/${auditDocId(run.runId, id)}` }));
    const audits = dumpCatalog(await readPlannedDocs(db, auditPlans));
    expect(auditPlans).toHaveLength(257);
    const leftovers: string[] = [];
    for (const name of ["trainingCatalogAuditLogs", "trainingCatalogMigrations"] as const) {
      const snap = await db.collection(`${ROOT}/${name}`).get();
      for (const item of snap.docs) {
        if (item.id === run.runId || item.data().runId === run.runId) continue;
        leftovers.push(item.ref.path);
      }
    }
    for (let index = 0; index < leftovers.length; index += 400) {
      const batch = db.batch();
      for (const docPath of leftovers.slice(index, index + 400)) batch.delete(db.doc(docPath));
      await batch.commit();
    }

    const child = runImport([
      "--mode",
      "resume",
      "--execute",
      "--target",
      "emulator",
      "--runId",
      run.runId,
      "--project",
      PROJECT_ID,
    ]);
    expect(child.status, child.stderr).toBe(0);
    const report = JSON.parse(child.stdout) as { actualContentWrites: number; idempotent: boolean };
    expect(report.actualContentWrites).toBe(0);
    expect(report.idempotent).toBe(true);
    expect(dumpCatalog(await readPlannedDocs(db, plans))).toBe(content);
    expect(dumpCatalog(await readPlannedDocs(db, auditPlans))).toBe(audits);
  });

  it("refuses a new initial after the lock is released while the catalog remains", async () => {
    const lock = (await db.doc(importLockPath()).get()).data();
    expect(lock?.status).toBe("released");
    const { plans } = loadPlans("2026-11-14T00:00:00.000Z");
    await expect(preflightInitial(db, plans)).rejects.toThrow(/is not empty/);
    expect((await readPlannedDocs(db, plans)).size).toBe(514);
  });

  it("refuses a rerun that would overwrite a document with a different checksum", async () => {
    const run = await beginRun(db, { runId: "run-idempotent", workbookSha256: EXPECTED_WORKBOOK_SHA256 });
    const { plans } = loadPlans(run.importedAt);
    const target = plans.find((plan) => plan.path === `${OBJECTS}/EX-L001`);
    expect(target).toBeDefined();
    const before = (await db.doc(`${OBJECTS}/EX-L001`).get()).data();
    expect(before?.checksum).toBe(target?.data.checksum);
    const tampered = `${String(before?.checksum)}-tampered`;
    await db.doc(`${OBJECTS}/EX-L001`).update({ checksum: tampered });

    await expect(importDocuments(db, plans, contextOf(run))).rejects.toThrow(
      new RegExp(`${OBJECTS}/EX-L001 expected checksum ${String(before?.checksum)} actual checksum ${tampered}`),
    );
    const after = (await db.doc(`${OBJECTS}/EX-L001`).get()).data();
    expect(after?.checksum).toBe(tampered);
    expect(after?.localeContent).toEqual(before?.localeContent);
    expect(after?.updatedAt).toBe(before?.updatedAt);
  });

  it("refuses a project id that does not start with demo-", () => {
    const child = runImport([
      "--target",
      "emulator",
      "--runId",
      "run-refused",
      "--project",
      "skatingx-prod",
    ]);
    expect(child.status).not.toBe(0);
    expect(child.stderr).toMatch(/demo-/);
  });
});
