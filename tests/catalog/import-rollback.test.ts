import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import {
  CONTENT_VERSION,
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  auditDocId,
  beginRun,
  executeImport,
  importLockPath,
  loadPlans,
  recoverImportLock,
  rollbackImport,
  tokenFingerprint,
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

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-import-rollback");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-import-rollback");
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
    const versions = await db.collection(`${ref.path}/versions`).listDocuments();
    for (const versionRef of versions) {
      paths.push(versionRef.path);
      const nested = await versionRef.listCollections();
      for (const collection of nested) {
        const children = await collection.get();
        for (const child of children.docs) paths.push(child.ref.path);
      }
    }
    const notes = await db.collection(`${ref.path}/notes`).get();
    for (const item of notes.docs) paths.push(item.ref.path);
  }
  const unique = [...new Set(paths)];
  for (let index = 0; index < unique.length; index += 400) {
    const batch = db.batch();
    for (const docPath of unique.slice(index, index + 400)) batch.delete(db.doc(docPath));
    await batch.commit();
  }
}

async function startRun(db: Firestore, runId: string, stopAfterObjects?: number) {
  const run = await beginRun(db, { runId, workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, initial: true });
  const { plans } = loadPlans(run.importedAt);
  await executeImport(db, plans, {
    runId: run.runId,
    importedAt: run.importedAt,
    actor: run.actor,
    lockToken: run.lockToken ?? "",
    ...(stopAfterObjects === undefined ? {} : { stopAfterObjects }),
  });
  return { run, plans };
}

describe.sequential("catalog import rollback guard", () => {
  const db = openFirestore();

  beforeEach(async () => {
    await wipeCatalog(db);
  });

  it("rolls back only the complete triples that were written", async () => {
    const { run, plans } = await startRun(db, "run-partial", 100);
    const parents = plans.filter((plan) => !plan.path.includes("/versions/"));
    const written = parents.slice(0, 100);
    const missing = parents[150];
    const result = await rollbackImport(db, run.runId, { lockToken: run.lockToken ?? "" });
    expect(result.rollbackResult).toMatchObject({ deletedParents: 100, deletedSnapshots: 100, retainedAudits: 100 });
    expect(result.rollbackResult?.controlWrites).toBeGreaterThan(0);
    for (const parent of written) expect((await db.doc(parent.path).get()).exists).toBe(false);
    expect((await db.doc(missing?.path ?? "").get()).exists).toBe(false);
    expect((await db.collection(AUDIT).get()).size).toBe(100);
    expect((await db.doc(`${MIGRATIONS}/${run.runId}`).get()).data()?.status).toBe("rolled_back");
    await expect(beginRun(db, { runId: run.runId, workbookSha256: EXPECTED_WORKBOOK_SHA256 })).rejects.toThrow(/rolled_back/);
  });

  it("stops before deleting when content, review, structure, or the plan record changed", async () => {
    const { run, plans } = await startRun(db, "run-rollback", 1);
    const parent = plans.find((plan) => !plan.path.includes("/versions/"));
    const parentPath = parent?.path ?? "";
    const snapshotPath = `${parentPath}/versions/${CONTENT_VERSION}`;
    const auditPath = `${AUDIT}/${auditDocId(run.runId, String(parent?.data.id))}`;
    const original = (await db.doc(parentPath).get()).data() ?? {};
    const token = run.lockToken ?? "";

    const locale = original.localeContent as { nameZh?: string };
    await db.doc(parentPath).update({ localeContent: { ...locale, nameZh: "changed-after-import" } });
    await expect(rollbackImport(db, run.runId, { lockToken: token })).rejects.toThrow(
      new RegExp(`${parentPath} does not match the stored plan`),
    );
    expect((await db.doc(parentPath).get()).data()?.localeContent).toMatchObject({ nameZh: "changed-after-import" });
    expect((await db.doc(snapshotPath).get()).exists).toBe(true);
    await db.doc(parentPath).update({ localeContent: original.localeContent });

    await db.doc(parentPath).update({ status: "published", reviewStatus: "approved" });
    await expect(rollbackImport(db, run.runId, { lockToken: token })).rejects.toThrow(/published\/approved/);
    await db.doc(parentPath).update({ status: "draft", reviewStatus: "pending" });
    expect((await db.doc(parentPath).get()).exists).toBe(true);

    await db.doc(`${parentPath}/notes/extra`).set({ marker: "extra" });
    await expect(rollbackImport(db, run.runId, { lockToken: token })).rejects.toThrow(
      new RegExp(`unexpected subcollection ${parentPath}/notes`),
    );
    await db.doc(`${parentPath}/notes/extra`).delete();

    const migrationRef = db.doc(`${MIGRATIONS}/${run.runId}`);
    const storedSummary = (await migrationRef.get()).data()?.planSummary;
    await migrationRef.update({ workbookSha256: "0".repeat(64) });
    await expect(rollbackImport(db, run.runId, { lockToken: token })).rejects.toThrow(/workbookSha256/);
    await migrationRef.update({ workbookSha256: EXPECTED_WORKBOOK_SHA256 });

    await migrationRef.update({ planSummary: { ...storedSummary, digest: "bad-digest" } });
    await expect(rollbackImport(db, run.runId, { lockToken: token })).rejects.toThrow(/plan summary/);
    await migrationRef.update({ planSummary: storedSummary });

    const snapshotPathData = (await db.doc(snapshotPath).get()).data() ?? {};
    await db.doc(snapshotPath).delete();
    await expect(rollbackImport(db, run.runId, { lockToken: token })).rejects.toThrow(/incomplete object group/);
    await db.doc(snapshotPath).set(snapshotPathData);
    expect((await db.doc(parentPath).get()).exists).toBe(true);

    await expect(rollbackImport(db, "run-other", { lockToken: token })).rejects.toThrow(/does not exist/);
    const lockRef = db.doc(importLockPath());
    await lockRef.update({ status: "held", purpose: "import" });
    await expect(rollbackImport(db, run.runId, { lockToken: token })).rejects.toThrow(/import is still running/);
    await lockRef.update({ status: "held", purpose: "rollback", token: "stored-from-database" });
    await expect(rollbackImport(db, run.runId, { memoryToken: "stored-from-database" })).rejects.toThrow(/must be recovered explicitly/);
    await lockRef.update({ status: "released", purpose: "import", token });
    expect((await db.doc(parentPath).get()).exists).toBe(true);
    expect((await db.doc(auditPath).get()).exists).toBe(true);

    await expect(
      rollbackImport(db, run.runId, {
        lockToken: token,
        beforeDelete: async () => {
          await db.doc(parentPath).update({ checksum: `${String(original.checksum)}-changed` });
        },
      }),
    ).rejects.toThrow(new RegExp(`${parentPath} changed after verification`));
    expect((await db.doc(parentPath).get()).data()?.checksum).toBe(`${String(original.checksum)}-changed`);
    expect((await db.doc(snapshotPath).get()).exists).toBe(true);
  });

  it("continues a rollback from the recorded stage and rejects a mismatched audit", async () => {
    const { run, plans } = await startRun(db, "run-resume-rollback", 2);
    const parents = plans.filter((plan) => !plan.path.includes("/versions/")).slice(0, 2);
    const migration = db.doc(`${MIGRATIONS}/${run.runId}`);
    const audit = (await db.collection(AUDIT).limit(1).get()).docs[0];
    const originalChecksum = audit?.data().checksum;
    await audit?.ref.update({ checksum: "not-the-parent" });
    await expect(rollbackImport(db, run.runId, { lockToken: run.lockToken ?? "" })).rejects.toThrow(/audit checksum does not match the parent/);
    await audit?.ref.update({ checksum: originalChecksum });
    for (const parent of parents) {
      await db.doc(`${parent.path}/versions/${CONTENT_VERSION}`).delete();
    }
    await migration.update({ rollbackProgress: { stage: "snapshots", updatedAt: "2026-11-15T00:00:00.000Z" } });
    const result = await rollbackImport(db, run.runId, { lockToken: run.lockToken ?? "" });
    expect(result.status).toBe("rolled_back");
    for (const parent of parents) expect((await db.doc(parent.path).get()).exists).toBe(false);
    expect((await db.collection(AUDIT).get()).size).toBe(2);
    expect((await migration.get()).data()?.rollbackProgress).toMatchObject({ stage: "done" });
    expect(result.rollbackResult?.controlWrites).toBeGreaterThan(0);
  });

  it("refuses the rollback when an audit checksum changes after verification", async () => {
    const { run, plans } = await startRun(db, "run-audit-race", 1);
    const parent = plans.find((plan) => !plan.path.includes("/versions/"));
    if (!parent) throw new Error("missing parent");
    const auditRef = db.doc(`${AUDIT}/${auditDocId(run.runId, String(parent.data.id))}`);
    const snapshot = db.doc(`${parent.path}/versions/${CONTENT_VERSION}`);
    await expect(rollbackImport(db, run.runId, {
      lockToken: run.lockToken ?? "",
      beforeDelete: async () => {
        await auditRef.update({ checksum: "changed-after-verification" });
      },
    })).rejects.toThrow(/changed after verification/);
    expect((await snapshot.get()).exists).toBe(true);
    expect((await auditRef.get()).data()).toMatchObject({ result: "ok", runId: run.runId });
  });

  it("moves a recovered lock into rollback without a resume", async () => {
    const { run } = await startRun(db, "run-recovered-rollback", 1);
    await db.doc(importLockPath()).update({ status: "held", purpose: "import" });
    const lockSnap = await db.doc(importLockPath()).get();
    const lockVersion = lockSnap.updateTime;
    if (!lockVersion) throw new Error("lock version missing");
    await recoverImportLock(db, {
      runId: run.runId,
      actor: IMPORT_ACTOR,
      reason: "holder crashed",
      confirmHolderDead: true,
      confirmedTokenFingerprint: tokenFingerprint(String(lockSnap.data()?.token ?? "")),
      confirmedLockUpdateTime: lockVersion,
      confirmedPurpose: String(lockSnap.data()?.purpose ?? ""),
      confirmedHolder: String(lockSnap.data()?.actor ?? ""),
    });
    expect((await db.doc(importLockPath()).get()).data()).toMatchObject({ purpose: "import", status: "recovered" });
    const result = await rollbackImport(db, run.runId, {});
    expect(result.status).toBe("rolled_back");
    expect((await db.doc(importLockPath()).get()).data()?.status).toBe("rolled_back");
    expect((await db.doc(importLockPath()).get()).data()?.purpose).toBe("rollback");
  });

  it("fails a rollback commit without deleting, then finishes on retry", async () => {
    const { run } = await startRun(db, "run-rollback-fault", 2);
    const original = db.runTransaction.bind(db);
    let attempts = 0;
    db.runTransaction = (async (updateFunction) => {
      attempts += 1;
      if (attempts === 2) throw new Error("injected rollback commit failure");
      return original(updateFunction);
    }) as typeof db.runTransaction;
    await expect(rollbackImport(db, run.runId, { lockToken: run.lockToken ?? "" })).rejects.toThrow(/commit failed/);
    db.runTransaction = original;
    const parent = (await db.collection(OBJECTS).limit(1).get()).docs[0];
    expect(parent?.exists).toBe(true);
    expect((await db.doc(`${MIGRATIONS}/${run.runId}`).get()).data()?.status).not.toBe("rolled_back");
    const token = (await db.doc(importLockPath()).get()).data()?.token;
    const result = await rollbackImport(db, run.runId, { lockToken: String(token) });
    expect(result.status).toBe("rolled_back");
    expect(result.rollbackResult?.controlWrites).toBeGreaterThan(0);
    expect((await db.collection(OBJECTS).get()).size).toBe(0);
    expect((await db.collection(AUDIT).get()).size).toBe(2);
  });

  it("refuses rollback while the import lock is still held", async () => {
    const run = await beginRun(db, { runId: "run-live", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, initial: true });
    await expect(rollbackImport(db, run.runId, { lockToken: run.lockToken ?? "" })).rejects.toThrow(/import is still running/);
    await expect(beginRun(db, {
      runId: run.runId,
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor: IMPORT_ACTOR,
      lockToken: run.lockToken,
    })).resolves.toMatchObject({ lockToken: run.lockToken });
  });

  it("refuses a v1 delete when the parent or audit version changed, a stage moves backward, or a ghost version remains", async () => {
    const { run, plans } = await startRun(db, "run-bound-delete", 1);
    const parent = plans.find((plan) => !plan.path.includes("/versions/"));
    const parentPath = parent?.path ?? "";
    const snapshotPath = `${parentPath}/versions/${CONTENT_VERSION}`;
    const auditPath = `${AUDIT}/imp-${run.runId}-${String(parent?.data.id)}`;
    await expect(rollbackImport(db, run.runId, {
      lockToken: run.lockToken ?? "",
      beforeDelete: async () => {
        await db.doc(parentPath).update({ note: "changed-after-verification" });
      },
    })).rejects.toThrow(new RegExp(`${parentPath} changed after verification`));
    expect((await db.doc(snapshotPath).get()).exists).toBe(true);

    await db.doc(parentPath).update({ note: "restored" });
    const restored = await db.doc(parentPath).get();
    const original = plans.find((plan) => plan.path === parentPath);
    await db.doc(parentPath).set(original?.data ?? restored.data() ?? {});
    await expect(rollbackImport(db, run.runId, {
      lockToken: (await db.doc(importLockPath()).get()).data()?.token as string,
      beforeDelete: async () => {
        await db.doc(auditPath).update({ note: "audit-changed" });
      },
    })).rejects.toThrow(new RegExp(`${auditPath} changed after verification`));
    expect((await db.doc(snapshotPath).get()).exists).toBe(true);

    await expect(rollbackImport(db, run.runId, {
      lockToken: (await db.doc(importLockPath()).get()).data()?.token as string,
      beforeDelete: async () => {
        await db.doc(`${MIGRATIONS}/${run.runId}`).update({ rollbackProgress: { stage: "parents", updatedAt: "2026-11-15T00:00:00.000Z" } });
      },
    })).rejects.toThrow(/migration stage moved after verification/);
    expect((await db.doc(snapshotPath).get()).exists).toBe(true);

    const ghost = `${parentPath}/versions/v2/nested/child`;
    try {
      await db.doc(ghost).set({ ghost: true });
      await expect(rollbackImport(db, run.runId, {
        lockToken: (await db.doc(importLockPath()).get()).data()?.token as string,
      })).rejects.toThrow(/ghost version/);
      expect((await db.doc(snapshotPath).get()).exists).toBe(true);
    } finally {
      await db.doc(ghost).delete();
    }
  });
});
