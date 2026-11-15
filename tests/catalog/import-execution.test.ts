import { readFileSync } from "node:fs";

import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import {
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  beginRun,
  executeImport,
  importLockPath,
  loadPlans,
  recoverImportLock,
} from "../../scripts/catalog/import-core.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
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

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-import-execution");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-import-execution");
  return getFirestore(app);
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

describe.sequential("catalog import execution guard", () => {
  const db = openFirestore();

  beforeEach(async () => {
    await wipeCatalog(db);
  });

  it("keeps document deletion inside rollback", () => {
    const source = readFileSync(new URL("../../scripts/catalog/import-core.mjs", import.meta.url), "utf8");
    expect(source).not.toMatch(/export async function deleteDocuments/);
    expect(source).not.toContain('planSource: "trusted"');
    expect(source).toContain("acquireRollbackLock");
  });

  it("keeps a live holder exclusive until a person confirms that holder is dead", async () => {
    const run = await beginRun(db, { runId: "run-lock", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, initial: true });
    const { plans } = loadPlans(run.importedAt);
    const context = {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: run.actor,
      lockToken: run.lockToken ?? "",
      leaveLockHeld: true,
      beforeBatch: () => {
        throw new Error("injected crash");
      },
    };
    await expect(executeImport(db, plans, context)).rejects.toThrow(/injected crash/);
    await db.doc(importLockPath()).update({ acquiredAt: "1970-01-01T00:00:00.000Z" });
    await expect(
      beginRun(db, { runId: "run-other", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR }),
    ).rejects.toThrow(/import lock is held by run-lock/);
    await expect(
      recoverImportLock(db, { runId: "run-lock", actor: IMPORT_ACTOR, reason: "holder crashed", confirmHolderDead: false }),
    ).rejects.toThrow(/holder has not been confirmed dead/);
    const recovered = await recoverImportLock(db, {
      runId: "run-lock",
      actor: IMPORT_ACTOR,
      reason: "holder crashed",
      confirmHolderDead: true,
    });
    expect(recovered.lockToken).not.toBe(run.lockToken);
    expect(recovered.previousToken).toBe(run.lockToken);
    const audits = await db.collection(AUDIT).get();
    expect(audits.docs.map((item) => item.data())).toEqual([
      expect.objectContaining({
        action: "lock-recovery",
        previousToken: run.lockToken,
        token: recovered.lockToken,
        actor: IMPORT_ACTOR,
        reason: "holder crashed",
        result: "ok",
      }),
    ]);
    const accepted = await beginRun(db, {
      runId: "run-lock",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor: IMPORT_ACTOR,
      lockToken: recovered.lockToken,
    });
    expect(accepted.lockToken).toBe(recovered.lockToken);
    await expect(
      executeImport(db, plans, { ...context, lockToken: run.lockToken ?? "", leaveLockHeld: false, beforeBatch: undefined }),
    ).rejects.toThrow(/lock is not held/);
    const resumed = await executeImport(db, plans, {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: run.actor,
      lockToken: recovered.lockToken,
      stopAfterObjects: 0,
    });
    expect(resumed.actualContentWrites).toBe(0);
    expect((await db.collection(OBJECTS).get()).size).toBe(0);
  });

  it("adopts a recovered token on the next resume without another takeover", async () => {
    await beginRun(db, { runId: "run-adopt", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, initial: true });
    const recovered = await recoverImportLock(db, {
      runId: "run-adopt",
      actor: IMPORT_ACTOR,
      reason: "holder crashed",
      confirmHolderDead: true,
    });
    const adopted = await beginRun(db, {
      runId: "run-adopt",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor: IMPORT_ACTOR,
    });
    expect(adopted.lockToken).toBe(recovered.lockToken);
    expect((await db.doc(importLockPath()).get()).data()?.status).toBe("held");
  });

  it("refuses recovery when stored content no longer matches the plan", async () => {
    const run = await beginRun(db, { runId: "run-conflict", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, initial: true });
    const { plans } = loadPlans(run.importedAt);
    await executeImport(db, plans, {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: run.actor,
      lockToken: run.lockToken ?? "",
      stopAfterObjects: 1,
      leaveLockHeld: true,
    });
    const parent = plans.find((plan) => !plan.path.includes("/versions/"));
    await db.doc(parent?.path ?? "").update({ checksum: "changed" });
    const before = (await db.doc(importLockPath()).get()).data()?.token;
    await expect(recoverImportLock(db, {
      runId: "run-conflict",
      actor: IMPORT_ACTOR,
      reason: "holder crashed",
      confirmHolderDead: true,
    })).rejects.toThrow(/content conflict/);
    expect((await db.doc(importLockPath()).get()).data()?.token).toBe(before);
  });

  it("refuses a non-initial run when the migration is absent", async () => {
    await expect(beginRun(db, {
      runId: "run-missing",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor: IMPORT_ACTOR,
    })).rejects.toThrow(/does not exist/);
  });

  it("fails the batch that loses a create race and does not let another token continue", async () => {
    const run = await beginRun(db, { runId: "run-create", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, initial: true });
    const { plans } = loadPlans(run.importedAt);
    const parents = plans.filter((plan) => !plan.path.includes("/versions/"));
    let conflict = "";
    await expect(
      executeImport(db, plans, {
        runId: run.runId,
        importedAt: run.importedAt,
        actor: run.actor,
        lockToken: run.lockToken ?? "",
        beforeBatch: async ({ index, paths }) => {
          if (index !== 2) return;
          await expect(
            beginRun(db, { runId: "run-intruder", workbookSha256: EXPECTED_WORKBOOK_SHA256 }),
          ).rejects.toThrow(/held/);
          await expect(
            executeImport(db, plans, {
              runId: run.runId,
              importedAt: run.importedAt,
              actor: run.actor,
              lockToken: "forged-token",
            }),
          ).rejects.toThrow(/lock is not held/);
          conflict = paths.find((docPath) => !docPath.includes("/versions/") && !docPath.includes("/trainingCatalogAuditLogs/")) ?? "";
          await db.doc(conflict).set({ marker: "external" });
        },
      }),
    ).rejects.toThrow(new RegExp(`create conflict ${conflict}`));

    expect((await db.doc(conflict).get()).data()).toMatchObject({ marker: "external" });
    expect((await db.doc(parents[0]?.path ?? "").get()).exists).toBe(true);
    expect((await db.doc(parents[133]?.path ?? "").get()).exists).toBe(conflict === parents[133]?.path);
    const untouched = parents.slice(133).find((plan) => plan.path !== conflict);
    expect((await db.doc(untouched?.path ?? "").get()).exists).toBe(false);
    await expect(
      executeImport(db, plans, {
        runId: run.runId,
        importedAt: run.importedAt,
        actor: run.actor,
        lockToken: "forged-token",
      }),
    ).rejects.toThrow(/lock is not held/);
    expect((await db.doc(untouched?.path ?? "").get()).exists).toBe(false);
    await expect(
      beginRun(db, { runId: "run-intruder", workbookSha256: EXPECTED_WORKBOOK_SHA256 }),
    ).rejects.toThrow(/import lock belongs to run-create/);
  });

  it("rejects initial when the migration already exists and fails a fenced batch", async () => {
    const run = await beginRun(db, {
      runId: "run-fence",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor: IMPORT_ACTOR,
      initial: true,
    });
    await expect(beginRun(db, {
      runId: "run-fence",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor: IMPORT_ACTOR,
      initial: true,
    })).rejects.toThrow(/initial refused: migration run-fence already exists/);
    const { plans } = loadPlans(run.importedAt);
    await expect(executeImport(db, plans, {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: run.actor,
      lockToken: run.lockToken ?? "",
      beforeBatch: async () => {
        await db.doc(importLockPath()).update({ lastBatch: 0 });
      },
    })).rejects.toThrow(/batch 1 commit failed/);
    expect((await db.collection(OBJECTS).get()).size).toBe(0);
  });

  it("keeps committed totals when a later process writes nothing and continues from them", async () => {
    const run = await beginRun(db, { runId: "run-cumulative", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, initial: true });
    const { plans } = loadPlans(run.importedAt);
    const context = {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: run.actor,
      lockToken: run.lockToken ?? "",
    };
    const first = await executeImport(db, plans, { ...context, stopAfterObjects: 10 });
    expect(first.actualContentWrites).toBe(20);
    const migration = db.doc(`${ROOT}/trainingCatalogMigrations/run-cumulative`);
    expect((await migration.get()).data()).toMatchObject({
      cumulativeContentWrites: 20,
      cumulativeAuditWrites: 10,
    });
    const paused = await executeImport(db, plans, { ...context, stopAfterObjects: 0 });
    expect(paused.actualContentWrites).toBe(0);
    expect((await migration.get()).data()).toMatchObject({
      cumulativeContentWrites: 20,
      cumulativeAuditWrites: 10,
    });
    const continued = await executeImport(db, plans, { ...context, stopAfterObjects: 10 });
    expect(continued.actualContentWrites).toBe(20);
    expect((await migration.get()).data()).toMatchObject({
      cumulativeContentWrites: 40,
      cumulativeAuditWrites: 20,
    });
  });
});
