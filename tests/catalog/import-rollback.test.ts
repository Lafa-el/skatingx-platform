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
  loadPlans,
  rollbackImport,
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
    const versions = await db.collection(`${ref.path}/versions`).get();
    for (const item of versions.docs) paths.push(item.ref.path);
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
  const run = await beginRun(db, { runId, workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR });
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
    expect(result.rollbackResult).toEqual({ deletedParents: 100, deletedSnapshots: 100, retainedAudits: 100 });
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
    await expect(rollbackImport(db, run.runId, { lockToken: "wrong-token" })).rejects.toThrow(/lock is not held/);
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
});
