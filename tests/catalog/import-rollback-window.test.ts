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
  const existing = getApps().find((app) => app.name === "catalog-rollback-window");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-rollback-window");
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

describe.sequential("second process rollback", () => {
  const db = openFirestore();

  beforeEach(async () => {
    await wipeCatalog(db);
    await db.doc(`${ROOT}/users/rollback-ghost/raceDay/event-1/results/race_roster`).set({ status: "finished" });
  });

  it("takes over a crashed rollback, keeps the rollback stage, and finishes through acceptance", async () => {
    const runId = "run-window-rollback";
    const imported = step("import", runId);
    expect(imported.status, imported.stderr).toBe(0);
    const crashed = step("crash-rollback", runId);
    expect(crashed.status, crashed.stderr).toBe(0);
    expect(JSON.parse(crashed.stdout)).toMatchObject({ crashed: true });
    const blocked = step("reject-join", runId);
    expect(blocked.status, blocked.stderr).toBe(0);
    expect(JSON.parse(blocked.stdout)).toMatchObject({ joined: false });

    const recovered = step("recover", runId);
    expect(recovered.status, `${recovered.stderr}\n${recovered.stdout}`).toBe(0);
    expect(JSON.parse(recovered.stdout)).toMatchObject({
      purpose: "rollback",
      migrationStatus: "rolling_back",
      lockStatus: "recovered",
      recoveryLockWrites: 1,
      recoveryMigrationWrites: 1,
      recoveryAuditWrites: 1,
      recoveryControlWrites: 3,
    });
    const lock = (await db.doc(`${ROOT}/trainingCatalogMigrations/__import_lock`).get()).data();
    expect(lock?.purpose).toBe("rollback");
    expect(lock?.status).toBe("recovered");
    expect((await db.doc(`${ROOT}/trainingCatalogMigrations/${runId}`).get()).data()?.status).toBe("rolling_back");

    const claimed = step("crash-rollback", runId);
    expect(claimed.status, claimed.stderr).toBe(0);
    const blockedAgain = step("reject-join", runId);
    expect(blockedAgain.status, blockedAgain.stderr).toBe(0);
    const recoveredAgain = step("recover", runId);
    expect(recoveredAgain.status, recoveredAgain.stderr).toBe(0);
    expect(JSON.parse(recoveredAgain.stdout)).toMatchObject({ purpose: "rollback", migrationStatus: "rolling_back" });

    const finished = step("finish", runId);
    expect(finished.status, `${finished.stderr}\n${finished.stdout}`).toBe(0);
    const report = JSON.parse(finished.stdout);
    expect(report.rollback).toMatchObject({ deletedParents: 257, deletedSnapshots: 257, status: "rolled_back" });
    expect(report.rollback.totalOperations).toBe(514 + report.rollback.controlUpdates);
    expect(report.migrationStatus).toBe("rolled_back");
    expect(report.acceptance).toBe("failed");
    expect((await db.collection(OBJECTS).listDocuments())).toHaveLength(0);
  }, 180000);
});
