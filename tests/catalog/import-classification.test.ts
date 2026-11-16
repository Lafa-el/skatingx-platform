import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import { countBusinessData } from "../../scripts/catalog/import-guard.mjs";
import {
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  actorOf,
  beginRun,
  executeImport,
  importLockPath,
  loadPlans,
  readOnlyClassification,
} from "../../scripts/catalog/import-core.mjs";
import { runImportEntry } from "../../scripts/catalog/import-runner.mjs";
import { evaluateCatalogImport } from "../../scripts/catalog/verify-catalog.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const EMAIL = "catalog-importer@skatingx-prod.iam.gserviceaccount.com";
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
  const existing = getApps().find((app) => app.name === "catalog-classification");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-classification");
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
  for (let index = 0; index < paths.length; index += 400) {
    const batch = db.batch();
    for (const docPath of paths.slice(index, index + 400)) batch.delete(db.doc(docPath));
    await batch.commit();
  }
}

it("refuses a production classification when the service account is missing", async () => {
  const productionDb = {
    _settings: { projectId: "skatingx-prod", databaseId: "(default)" },
    databaseId: "(default)",
  };
  await expect(readOnlyClassification(productionDb as never, [], {
    runId: "run-missing-account",
    importedAt: "2026-11-15T00:00:00.000Z",
    actor: IMPORT_ACTOR,
    operator: IMPORT_ACTOR,
    lockToken: "",
  })).rejects.toThrow(/serviceAccount is required/);
});

describe.sequential("production-shaped classification and business baseline", () => {
  const db = openFirestore();

  beforeEach(async () => {
    await wipeCatalog(db);
  });

  it("classifies a production identity as present and fails acceptance after one audit identity change", async () => {
    const run = await beginRun(db, {
      runId: "run-prod-shape",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor: IMPORT_ACTOR,
      serviceAccount: EMAIL,
      initial: true,
    });
    const { plans } = loadPlans(run.importedAt);
    await executeImport(db, plans, {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: run.actor,
      operator: run.actor,
      serviceAccount: EMAIL,
      lockToken: run.lockToken ?? "",
    });
    const context = {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: actorOf(run),
      operator: run.actor,
      serviceAccount: EMAIL,
      lockToken: "",
    };
    const classified = await readOnlyClassification(db, plans, context);
    expect(classified.present).toBe(257);
    expect(classified.absent).toBe(0);
    expect(classified.mismatched).toEqual([]);
    const audit = (await db.collection(AUDIT).limit(1).get()).docs[0];
    await audit?.ref.update({ serviceAccount: "other@skatingx-prod.iam.gserviceaccount.com" });
    const drifted = await readOnlyClassification(db, plans, context);
    expect(drifted.mismatched.length).toBeGreaterThan(0);
    const report = evaluateCatalogImport({
      mode: "emulator",
      runId: run.runId,
      projectId: PROJECT_ID,
      databaseId: "(default)",
      gitHead: run.gitSha ?? "",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      migration: (await db.doc(`${ROOT}/trainingCatalogMigrations/${run.runId}`).get()).data() ?? null,
      plans,
      stored: [],
      inspected: { collectionDocs: {}, orphans: [], versionPaths: [] },
      audits: [],
      business: { countBefore: 1, countAfter: 1, changes: [] },
      idempotency: {
        skipped: false,
        readOnly: true,
        present: drifted.present,
        absent: drifted.absent,
        mismatched: drifted.mismatched,
        incomplete: drifted.incomplete,
        conflicts: drifted.mismatched,
      },
    });
    const idempotency = report.checks.find((item) => item.name === "idempotency");
    expect(idempotency?.passed).toBe(false);
    expect(idempotency?.detail).toContain("mismatched");
    const before = (await db.doc(importLockPath()).get()).data()?.status;
    await expect(runImportEntry({
      target: "emulator",
      project: PROJECT_ID,
      confirm: "",
      mode: "resume",
      runId: run.runId,
      execute: true,
      actor: IMPORT_ACTOR,
      databaseId: "(default)",
    }, {
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
      openFirestore: async () => db,
      confirmProject: async () => PROJECT_ID,
    })).rejects.toThrow(/resume refused/);
    expect((await db.doc(importLockPath()).get()).data()?.status).toBe(before);
  });

  it("counts subcollections when the parent user document does not exist and rejects an empty baseline", async () => {
    const userPath = `${ROOT}/users/missing-parent`;
    await db.doc(`${userPath}/raceDay/event-1/results/race_roster`).set({ status: "finished" });
    await db.doc(`${userPath}/videos/clip-1`).set({ title: "clip" });
    expect((await db.doc(userPath).get()).exists).toBe(false);
    const counts = await countBusinessData(db);
    expect(counts.firestoreUsers).toBeGreaterThan(0);
    expect(counts.raceResults).toBeGreaterThan(0);
    expect(counts.videoMetadata).toBeGreaterThan(0);
    const report = evaluateCatalogImport({
      mode: "emulator",
      runId: "empty-baseline",
      projectId: PROJECT_ID,
      databaseId: "(default)",
      gitHead: "",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      migration: null,
      plans: [],
      stored: [],
      inspected: { collectionDocs: {}, orphans: [], versionPaths: [] },
      audits: [],
      business: { countBefore: 0, countAfter: 0, changes: [] },
      idempotency: { skipped: true },
    });
    const business = report.checks.find((item) => item.name === "businessUnchanged");
    expect(business?.passed).toBe(false);
    expect(business?.detail).toContain("business baseline is empty");
    await db.doc(`${userPath}/raceDay/event-1/results/race_roster`).delete();
    await db.doc(`${userPath}/videos/clip-1`).delete();
  });
});
