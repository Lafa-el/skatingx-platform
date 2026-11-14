import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import {
  CONTENT_VERSION,
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  auditDocId,
  beginRun,
  dumpCatalog,
  executeImport,
  loadPlans,
  preflightInitial,
  readPlannedDocs,
} from "../../scripts/catalog/import-core.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const MIGRATIONS = `${ROOT}/trainingCatalogMigrations`;
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
const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const runImportPath = path.join(rootDir, "scripts/catalog/run-import.mjs");

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-import-resume");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-import-resume");
  return getFirestore(app);
}

function runImport(args: string[]) {
  return spawnSync(process.execPath, [runImportPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
  });
}

async function wipeCatalog(db: Firestore): Promise<void> {
  const paths: string[] = [];
  for (const name of COLLECTIONS) {
    const snap = await db.collection(`${ROOT}/${name}`).get();
    for (const item of snap.docs) paths.push(item.ref.path);
  }
  const parents = await db.collection(OBJECTS).get();
  for (const parent of parents.docs) {
    const versions = await db.collection(`${parent.ref.path}/versions`).get();
    for (const item of versions.docs) paths.push(item.ref.path);
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

describe.sequential("catalog import resume", () => {
  const db = openFirestore();

  beforeAll(async () => {
    await wipeCatalog(db);
  });

  it("does not write when the initial preflight finds unknown catalog data", async () => {
    const unknown = `${ROOT}/trainingCatalogKnowledgeArticles/unknown-article`;
    await db.doc(unknown).set({ marker: "keep" });
    const { plans } = loadPlans("2026-11-14T00:00:00.000Z");
    await expect(preflightInitial(db, plans)).rejects.toThrow(/trainingCatalogKnowledgeArticles is not empty/);
    expect((await db.collection(MIGRATIONS).get()).size).toBe(0);
    expect((await db.doc(unknown).get()).data()).toMatchObject({ marker: "keep" });
    await db.doc(unknown).delete();
  });

  it("refuses an initial import when an orphan version has no parent", async () => {
    const orphan = `${OBJECTS}/ORPHAN/versions/${CONTENT_VERSION}`;
    await db.doc(orphan).set({ marker: "orphan", n: 1 });
    const { plans } = loadPlans("2026-11-14T00:00:00.000Z");
    await expect(preflightInitial(db, plans)).rejects.toThrow(new RegExp(orphan));
    expect((await db.doc(orphan).get()).data()).toMatchObject({ marker: "orphan", n: 1 });
    expect((await db.collection(MIGRATIONS).get()).size).toBe(0);
    await db.doc(orphan).delete();
  });

  it("resumes the remaining object groups without rewriting the first hundred", async () => {
    const run = await beginRun(db, {
      runId: "run-resume",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor: IMPORT_ACTOR,
      gitSha: "abc123",
    });
    expect(run.created).toBe(true);
    expect(run.actor).toBe(IMPORT_ACTOR);
    expect(run.databaseId).toBe("(default)");
    expect(run.planSummary?.parents).toBe(257);
    const { plans } = loadPlans(run.importedAt);
    const partial = await executeImport(db, plans, {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: run.actor,
      stopAfterObjects: 100,
    });
    expect(partial.actualContentWrites).toBe(200);
    expect(partial.actualAuditWrites).toBe(100);
    expect(partial.remainingPlanned).toBe(157);
    expect(partial.plannedContentWrites).toBe(514);
    expect(partial.runStatus).toBe("running");
    const parents = plans.filter((plan) => !plan.path.includes("/versions/"));
    const firstIds = parents.slice(0, 100).map((plan) => String(plan.data.id));
    const firstPaths = firstIds.flatMap((id) => [
      { path: `${OBJECTS}/${id}` },
      { path: `${OBJECTS}/${id}/versions/${CONTENT_VERSION}` },
      { path: `${AUDIT}/${auditDocId(run.runId, id)}` },
    ]);
    const before = dumpCatalog(await readPlannedDocs(db, firstPaths));

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
      "--actor",
      IMPORT_ACTOR,
    ]);
    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    expect(child.stderr).toContain("remainingObjectGroups: 157");
    expect(child.stderr).toContain("plannedContentWrites: 314");
    expect(child.stderr).toContain("baseBudget: 772");
    expect(child.stderr).toContain("safety:");
    expect(child.stderr).not.toContain("plannedContentWrites: 514");
    const report = JSON.parse(child.stdout) as {
      plannedContentWrites: number;
      plannedAuditWrites: number;
      plannedMigrationCreates: number;
      actualContentWrites: number;
      actualAuditWrites: number;
      skippedExisting: number;
      remainingPlanned: number;
      idempotent: boolean;
      runStatus: string;
      batches: Array<{ index: number; cumulativeContent: number; cumulativeAudits: number }>;
    };
    expect(report.plannedContentWrites).toBe(314);
    expect(report.plannedAuditWrites).toBe(157);
    expect(report.plannedMigrationCreates).toBe(0);
    expect(report.actualContentWrites).toBe(314);
    expect(report.actualAuditWrites).toBe(157);
    expect(report.skippedExisting).toBe(100);
    expect(report.remainingPlanned).toBe(0);
    expect(report.runStatus).toBe("completed");
    for (const batch of report.batches) {
      expect(child.stderr).toContain(
        `batch ${batch.index} objects=`,
      );
      expect(child.stderr).toContain(`cumulativeContent=${batch.cumulativeContent}`);
      expect(child.stderr).toContain(`cumulativeAudits=${batch.cumulativeAudits}`);
    }
    expect(dumpCatalog(await readPlannedDocs(db, firstPaths))).toBe(before);
    const stored = await readPlannedDocs(db, plans);
    expect(stored.size).toBe(514);
    const audits = await readPlannedDocs(
      db,
      parents.map((plan) => ({ path: `${AUDIT}/${auditDocId(run.runId, String(plan.data.id))}` })),
    );
    expect(audits.size).toBe(257);
    expect(new Set(audits.keys()).size).toBe(257);

    const again = runImport([
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
    expect(again.status, again.stderr).toBe(0);
    const second = JSON.parse(again.stdout) as { actualContentWrites: number; plannedContentWrites: number; idempotent: boolean };
    expect(second.actualContentWrites).toBe(0);
    expect(second.plannedContentWrites).toBe(0);
    expect(second.idempotent).toBe(true);
    expect(again.stderr).toContain("remainingObjectGroups:");
    expect(again.stderr).toContain("baseBudget: 772");
    expect(again.stderr).toContain("safety:");

    const preview = runImport([
      "--mode",
      "resume",
      "--target",
      "emulator",
      "--runId",
      run.runId,
      "--project",
      PROJECT_ID,
    ]);
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stderr).toContain(`runId: ${run.runId}`);
    expect(preview.stderr).toContain("remainingObjectGroups: 0");
    expect(preview.stderr).toContain("plannedContentWrites: 0");
    expect(preview.stderr).toContain("baseBudget: 772");
    expect(preview.stderr).toContain("safety:");
    expect(JSON.parse(preview.stdout).phase).toBe("preflight");
  });

  it("refuses resume from a different actor without rewriting the run", async () => {
    const before = (await db.doc(`${OBJECTS}/EX-L001`).get()).data();
    const child = runImport([
      "--mode",
      "resume",
      "--execute",
      "--target",
      "emulator",
      "--runId",
      "run-resume",
      "--project",
      PROJECT_ID,
      "--actor",
      "other-operator",
    ]);
    expect(child.status).not.toBe(0);
    expect(child.stderr).toMatch(/actor mismatch/);
    expect((await db.doc(`${OBJECTS}/EX-L001`).get()).data()).toEqual(before);
  });

  it("refuses an incomplete object group instead of rebuilding it", async () => {
    const parentPath = `${OBJECTS}/EX-L002`;
    const versionPath = `${parentPath}/versions/${CONTENT_VERSION}`;
    const before = (await db.doc(parentPath).get()).data();
    await db.doc(versionPath).delete();
    const child = runImport([
      "--mode",
      "resume",
      "--execute",
      "--target",
      "emulator",
      "--runId",
      "run-resume",
      "--project",
      PROJECT_ID,
    ]);
    expect(child.status).not.toBe(0);
    expect(child.stderr).toMatch(/incomplete object group EX-L002: parent present, snapshot missing, audit present/);
    expect((await db.doc(parentPath).get()).data()).toEqual(before);
    expect((await db.doc(versionPath).get()).exists).toBe(false);
    await db.doc(versionPath).set((await loadPlans(String((await db.doc(`${MIGRATIONS}/run-resume`).get()).data()?.importedAt))).plans.find((plan) => plan.path === versionPath)?.data ?? {});
  });

  it("reports the tampered path and checksum and does not overwrite it", async () => {
    const parentPath = `${OBJECTS}/EX-L001`;
    const before = (await db.doc(parentPath).get()).data();
    const tampered = `${String(before?.checksum)}-tampered`;
    await db.doc(parentPath).update({ checksum: tampered });
    const child = runImport([
      "--mode",
      "resume",
      "--execute",
      "--target",
      "emulator",
      "--runId",
      "run-resume",
      "--project",
      PROJECT_ID,
    ]);
    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain(`${parentPath} expected checksum ${String(before?.checksum)} actual checksum ${tampered}`);
    const after = (await db.doc(parentPath).get()).data();
    expect(after?.checksum).toBe(tampered);
    expect(after?.updatedAt).toBe(before?.updatedAt);
  });
});
