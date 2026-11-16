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
const script = path.join(rootDir, "scripts/catalog/production-rollback-route.mjs");
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
  const existing = getApps().find((app) => app.name === "catalog-production-rollback-route");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-production-rollback-route");
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

describe.sequential("production rollback routing", () => {
  const db = openFirestore();

  beforeEach(async () => {
    await wipeCatalog(db);
  });

  it("enters rollback on a non-empty catalog, recovers a partial rollback, and still refuses a plain resume", async () => {
    const first = "run-prod-route-rollback";
    const imported = step("import", first);
    expect(imported.status, `${imported.stderr}\n${imported.stdout}`).toBe(0);
    const rolled = step("rollback", first);
    expect(rolled.status, `${rolled.stderr}\n${rolled.stdout}`).toBe(0);
    expect(rolled.stderr).not.toMatch(/is not empty/);
    expect(JSON.parse(rolled.stdout)).toMatchObject({ status: "rolled_back", deletedParents: 257, deletedSnapshots: 257 });
    await wipeCatalog(db);

    const runId = "run-prod-route-recover";
    const again = step("import", runId);
    expect(again.status, `${again.stderr}\n${again.stdout}`).toBe(0);
    const crashed = step("crash-snapshots", runId);
    expect(crashed.status, `${crashed.stderr}\n${crashed.stdout}`).toBe(0);
    expect(JSON.parse(crashed.stdout)).toMatchObject({ crashed: "snapshots" });

    const resumed = step("resume", runId);
    expect(resumed.status, `${resumed.stderr}\n${resumed.stdout}`).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({ refused: true });
    expect((await db.doc(`${ROOT}/trainingCatalogMigrations/__import_lock`).get()).data()?.status).toBe("held");

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
  }, 300000);
});
