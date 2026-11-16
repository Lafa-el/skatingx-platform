import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const script = path.join(rootDir, "scripts/catalog/rollback-window.mjs");
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
  const existing = getApps().find((app) => app.name === "catalog-rollback-interrupts");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-rollback-interrupts");
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

function step(mode: string, runId: string) {
  return spawnSync(process.execPath, [script, mode, runId], {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
  });
}

function expectRollbackVerified(runId: string) {
  const verified = step("verify-rollback", runId);
  expect(verified.status, `${verified.stderr}\n${verified.stdout}`).toBe(0);
  expect(JSON.parse(verified.stdout)).toMatchObject({
    consistent: true,
    contentRemaining: 0,
    objectAudits: 257,
    status: "rolled_back",
    deletedParents: 257,
    deletedSnapshots: 257,
  });
  const report = JSON.parse(verified.stdout);
  expect(report.totalOperations).toBe(514 + report.controlUpdates);
  expect(report.controlWrites).toBe(report.totalOperations);
}

describe.sequential("rollback interrupts", () => {
  const db = openFirestore();

  beforeEach(async () => {
    await wipeCatalog(db);
  });

  async function recoverAndFinish(runId: string, crashMode: string) {
    const imported = step("import", runId);
    expect(imported.status, imported.stderr).toBe(0);
    const crashed = step(crashMode, runId);
    expect(crashed.status, `${crashed.stderr}\n${crashed.stdout}`).toBe(0);
    const recovered = step("recover", runId);
    expect(recovered.status, `${recovered.stderr}\n${recovered.stdout}`).toBe(0);
    expect(JSON.parse(recovered.stdout)).toMatchObject({
      purpose: "rollback",
      migrationStatus: "rolling_back",
      recoveryLockWrites: 1,
      recoveryMigrationWrites: 1,
      recoveryAuditWrites: 1,
    });
    const finished = step("finish", runId);
    expect(finished.status, `${finished.stderr}\n${finished.stdout}`).toBe(0);
    expectRollbackVerified(runId);
  }

  it("recovers after some snapshots were deleted", async () => {
    await recoverAndFinish("run-interrupt-snapshots", "crash-snapshots");
  }, 180000);

  it("recovers after some parents were deleted", async () => {
    await recoverAndFinish("run-interrupt-parents", "crash-parents");
  }, 180000);

  it("recovers before and after the mark stage", async () => {
    await recoverAndFinish("run-interrupt-before-mark", "crash-before-mark");
    await wipeCatalog(db);
    await recoverAndFinish("run-interrupt-after-mark", "crash-after-mark");
  }, 300000);

  it("keeps a committed rollback when the caller never receives the response", async () => {
    const runId = "run-interrupt-response";
    const imported = step("import", runId);
    expect(imported.status, imported.stderr).toBe(0);
    const crashed = step("crash-after-commit", runId);
    expect(crashed.status, `${crashed.stderr}\n${crashed.stdout}`).toBe(0);
    expect(JSON.parse(crashed.stdout)).toMatchObject({ crashed: "crash-after-commit" });
    expectRollbackVerified(runId);
  }, 180000);
});
