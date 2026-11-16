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
const script = path.join(rootDir, "scripts/catalog/recovery-window.mjs");
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
  const existing = getApps().find((app) => app.name === "catalog-recovery-window");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-recovery-window");
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

function windowStep(mode: string, runId: string) {
  return spawnSync(process.execPath, [script, mode, runId], {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
  });
}

describe.sequential("catalog recovery crash window", () => {
  const db = openFirestore();

  beforeEach(async () => {
    await wipeCatalog(db);
    await db.doc(`${ROOT}/users/recovery-ghost/raceDay/event-1/results/race_roster`).set({ status: "finished" });
  });

  it("resumes to acceptance after recovery exits before the claim", () => {
    const runId = "run-window-before-claim";
    const held = windowStep("hold", runId);
    expect(held.status, held.stderr).toBe(0);
    const recovered = windowStep("recover-exit", runId);
    expect(recovered.status, recovered.stderr).toBe(0);
    const resumed = windowStep("resume-verify", runId);
    expect(resumed.status, `${resumed.stderr}\n${resumed.stdout}`).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({ acceptance: "passed", passed: true, status: "completed" });
  });

  it("recovers a claimed lock only after the new holder is confirmed dead", () => {
    const runId = "run-window-after-claim";
    expect(windowStep("hold", runId).status).toBe(0);
    expect(windowStep("recover-exit", runId).status).toBe(0);
    const claimed = windowStep("adopt-exit", runId);
    expect(claimed.status, claimed.stderr).toBe(0);
    const again = windowStep("recover-exit", runId);
    expect(again.status, again.stderr).toBe(0);
    const resumed = windowStep("resume-verify", runId);
    expect(resumed.status, `${resumed.stderr}\n${resumed.stdout}`).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({ acceptance: "passed", passed: true, status: "completed" });
  });
});
