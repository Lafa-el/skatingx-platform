import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import {
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  auditDocId,
  beginRun,
  executeImport,
  loadPlans,
} from "../../scripts/catalog/import-core.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const MIGRATIONS = `${ROOT}/trainingCatalogMigrations`;
const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
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
  const existing = getApps().find((app) => app.name === "catalog-import-faults");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-import-faults");
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

function withFaults(db: Firestore, faults: { failContentCommit?: number; failMigrationUpdate?: number | "completion" }): Firestore {
  let contentCommits = 0;
  let migrationUpdates = 0;
  const wrapBatch = (batch: FirebaseFirestore.WriteBatch) => {
    let creates = 0;
    return new Proxy(batch, {
      get(target, prop, receiver) {
        if (prop === "create") {
          return (...args: unknown[]) => {
            creates += 1;
            return Reflect.apply(target.create, target, args);
          };
        }
        if (prop === "commit") {
          return async () => {
            if (creates > 0) {
              contentCommits += 1;
              if (faults.failContentCommit === contentCommits) throw new Error("injected batch commit failure");
            }
            return target.commit();
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "batch") return () => wrapBatch(target.batch());
      if (prop === "doc") {
        return (docPath: string) => {
          const ref = target.doc(docPath);
          if (!docPath.includes("/trainingCatalogMigrations/") || docPath.endsWith("/__import_lock")) return ref;
          return new Proxy(ref, {
            get(refTarget, refProp, refReceiver) {
              if (refProp === "update") {
                return async (data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) => {
                  migrationUpdates += 1;
                  const status = typeof data === "object" && data !== null && "status" in data ? data.status : undefined;
                  if (faults.failMigrationUpdate === "completion" && status === "completed") {
                    throw new Error("injected migration update failure");
                  }
                  if (typeof faults.failMigrationUpdate === "number" && faults.failMigrationUpdate === migrationUpdates) {
                    throw new Error("injected migration update failure");
                  }
                  return refTarget.update(data);
                };
              }
              const value = Reflect.get(refTarget, refProp, refReceiver);
              return typeof value === "function" ? value.bind(refTarget) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Firestore;
}

function resume(runId: string) {
  return spawnSync(process.execPath, [
    path.join(rootDir, "scripts/catalog/run-import.mjs"),
    "--mode", "resume", "--execute", "--target", "emulator",
    "--runId", runId, "--project", PROJECT_ID, "--actor", IMPORT_ACTOR,
  ], { cwd: rootDir, encoding: "utf8", env: process.env });
}

describe.sequential("catalog import fault injection", () => {
  const db = openFirestore();

  beforeEach(async () => {
    await wipeCatalog(db);
  });

  it("resumes after the second batch commit fails", async () => {
    const run = await beginRun(db, { runId: "run-fault-a", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR });
    const { plans } = loadPlans(run.importedAt);
    const parents = plans.filter((plan) => !plan.path.includes("/versions/"));
    await expect(
      executeImport(withFaults(db, { failContentCommit: 2 }), plans, {
        runId: run.runId,
        importedAt: run.importedAt,
        actor: run.actor,
        lockToken: run.lockToken ?? "",
      }),
    ).rejects.toThrow(/batch 2 commit failed/);
    expect((await db.doc(parents[0]?.path ?? "").get()).exists).toBe(true);
    expect((await db.doc(parents[133]?.path ?? "").get()).exists).toBe(false);
    const migration = (await db.doc(`${MIGRATIONS}/${run.runId}`).get()).data();
    expect(migration?.status).toBe("running");
    expect(migration?.completedObjects).toBe(133);
    expect(migration?.lastCompletedBatch).toBe(1);
    const child = resume(run.runId);
    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    const report = JSON.parse(child.stdout) as { actualContentWrites: number; actualAuditWrites: number };
    expect(report.actualContentWrites).toBe(248);
    expect(report.actualAuditWrites).toBe(124);
    expect((await db.collection(OBJECTS).get()).size).toBe(257);
    const audits = await db.collection(AUDIT).get();
    const ids = audits.docs.map((doc) => doc.id);
    expect(new Set(ids).size).toBe(257);
    expect(ids.every((id) => id.startsWith(`imp-${run.runId}-`))).toBe(true);
    expect((await db.doc(`${MIGRATIONS}/${run.runId}`).get()).data()?.status).toBe("completed");
  });

  it("completes the migration when content is already committed", async () => {
    const run = await beginRun(db, { runId: "run-fault-b", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR });
    const { plans } = loadPlans(run.importedAt);
    await expect(
      executeImport(withFaults(db, { failMigrationUpdate: "completion" }), plans, {
        runId: run.runId,
        importedAt: run.importedAt,
        actor: run.actor,
        lockToken: run.lockToken ?? "",
      }),
    ).rejects.toThrow(/batch 2 committed 124 objects; migration progress update failed/);
    expect((await db.collection(OBJECTS).get()).size).toBe(257);
    expect((await db.doc(`${MIGRATIONS}/${run.runId}`).get()).data()?.status).toBe("running");
    const child = resume(run.runId);
    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    const report = JSON.parse(child.stdout) as { actualContentWrites: number; actualAuditWrites: number; idempotent: boolean };
    expect(report.actualContentWrites).toBe(0);
    expect(report.actualAuditWrites).toBe(0);
    expect(report.idempotent).toBe(true);
    const audits = await db.collection(AUDIT).get();
    expect(audits.size).toBe(257);
    expect(new Set(audits.docs.map((doc) => doc.id)).size).toBe(257);
    const migration = (await db.doc(`${MIGRATIONS}/${run.runId}`).get()).data();
    expect(migration?.status).toBe("completed");
    expect(migration?.completedObjects).toBe(257);
    expect(migration?.remainingObjects).toBe(0);
    for (const parent of plans.filter((plan) => !plan.path.includes("/versions/"))) {
      expect((await db.doc(`${AUDIT}/${auditDocId(run.runId, String(parent.data.id))}`).get()).exists).toBe(true);
    }
  });

  it("rebuilds progress from stored triples when the progress update fails", async () => {
    const run = await beginRun(db, { runId: "run-fault-c", workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR });
    const { plans } = loadPlans(run.importedAt);
    await expect(
      executeImport(withFaults(db, { failMigrationUpdate: 1 }), plans, {
        runId: run.runId,
        importedAt: run.importedAt,
        actor: run.actor,
        lockToken: run.lockToken ?? "",
      }),
    ).rejects.toThrow(/batch 1 committed 133 objects; migration progress update failed/);
    const migration = (await db.doc(`${MIGRATIONS}/${run.runId}`).get()).data();
    expect(migration?.completedObjects).toBe(0);
    expect(migration?.status).toBe("running");
    expect((await db.collection(OBJECTS).get()).size).toBe(133);
    const child = resume(run.runId);
    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    const report = JSON.parse(child.stdout) as { actualContentWrites: number; actualAuditWrites: number };
    expect(report.actualContentWrites).toBe(248);
    expect(report.actualAuditWrites).toBe(124);
    expect((await db.collection(OBJECTS).get()).size).toBe(257);
    const audits = await db.collection(AUDIT).get();
    expect(new Set(audits.docs.map((doc) => doc.id)).size).toBe(257);
    expect((await db.doc(`${MIGRATIONS}/${run.runId}`).get()).data()?.completedObjects).toBe(257);
  });
});
