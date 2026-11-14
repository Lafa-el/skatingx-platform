import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { snapshotBusiness } from "../../scripts/catalog/backup-prod.mjs";
import {
  CONTENT_VERSION,
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  auditDocId,
  beginRun,
  executeImport,
  loadPlans,
} from "../../scripts/catalog/import-core.mjs";
import {
  businessReport,
  checkDraftReads,
  evaluateCatalogImport,
  readCatalogVerification,
  resumeIdempotency,
  verificationActions,
} from "../../scripts/catalog/verify-catalog.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const MIGRATIONS = `${ROOT}/trainingCatalogMigrations`;
const USERS = `${ROOT}/users`;
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
const RUN_ID = "run-verify";
const USER_PATH = `${USERS}/verify-user`;

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-import-verify");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-import-verify");
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
    for (const docPath of [...new Set(paths)].slice(index, index + 400)) batch.delete(db.doc(docPath));
    await batch.commit();
  }
}

function emulatorAddress() {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "").split(":");
  return { host, port };
}

type Report = Awaited<ReturnType<typeof evaluateCatalogImport>>;

describe.sequential("catalog import verification", () => {
  const db = openFirestore();
  let baseline: Awaited<ReturnType<typeof snapshotBusiness>>;
  let rules: Awaited<ReturnType<typeof checkDraftReads>>;
  let idempotency: { actualContentWrites: number | null; actualAuditWrites: number | null };
  let plans: Awaited<ReturnType<typeof loadPlans>>["plans"];

  beforeAll(async () => {
    await wipeCatalog(db);
    await db.doc(USER_PATH).set({ displayName: "Verify Athlete" });
    await db.doc(`${USER_PATH}/raceDay/event-1/results/race_roster`).set({ status: "finished" });
    await db.doc(`${USER_PATH}/videos/video-1`).set({ title: "clip", externalUrl: "https://example.com/clip" });
    baseline = await snapshotBusiness(db);
    const run = await beginRun(db, {
      runId: RUN_ID,
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor: IMPORT_ACTOR,
      gitSha: "verify-git",
    });
    plans = loadPlans(run.importedAt).plans;
    await executeImport(db, plans, { runId: run.runId, importedAt: run.importedAt, actor: run.actor });
    const address = emulatorAddress();
    rules = await checkDraftReads({
      host: address.host ?? "",
      port: address.port ?? "",
      projectId: PROJECT_ID,
      draftPath: `${OBJECTS}/EX-L039`,
    });
    const resumed = resumeIdempotency({ runId: RUN_ID, projectId: PROJECT_ID, rootDir });
    if (resumed.actualContentWrites !== 0 || resumed.actualAuditWrites !== 0) {
      throw new Error("resume wrote catalog documents during verification setup");
    }
    idempotency = resumed;
  });

  afterAll(async () => {
    const snap = await snapshotBusiness(db);
    for (const document of snap.documents) {
      if (document.path === USER_PATH || document.path.startsWith(`${USER_PATH}/`)) await db.doc(document.path).delete();
    }
  });

  async function currentReport(): Promise<Report> {
    const read = await readCatalogVerification(db, RUN_ID);
    return evaluateCatalogImport({
      mode: "emulator",
      runId: RUN_ID,
      projectId: read.projectId,
      databaseId: read.databaseId,
      gitHead: "verify-git",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      migration: read.migration,
      plans: read.plans,
      stored: read.stored,
      inspected: read.inspected,
      audits: read.audits,
      business: businessReport(baseline, await snapshotBusiness(db)),
      rules,
      idempotency,
    });
  }

  function failed(report: Report, name: string) {
    const check = report.checks.find((item) => item.name === name);
    expect(check, name).toBeDefined();
    return check!;
  }

  it("accepts a complete import and the three client contexts", async () => {
    const report = await currentReport();
    const problems = report.checks.filter((item) => !item.passed).map((item) => `${item.name}: ${item.detail}`);
    expect(problems, problems.join("; ")).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.counts).toMatchObject({ exercise: 120, drill: 68, block: 51, session: 18, refs: 172, audits: 257 });
    expect(rules).toEqual({ anonymous: "denied", signedIn: "denied", admin: "allowed" });
    expect(JSON.stringify(report)).not.toContain("Verify Athlete");
    expect(verificationActions("production")).toEqual({ resume: false, rulesClient: false, writes: false });
  });

  it("rejects a tampered parent or snapshot and writes nothing", async () => {
    const parentPath = `${OBJECTS}/EX-L001`;
    const versionPath = `${parentPath}/versions/${CONTENT_VERSION}`;
    const parentBefore = (await db.doc(parentPath).get()).data();
    const versionBefore = (await db.doc(versionPath).get()).data();
    const marker = (await db.doc(parentPath).get()).updateTime?.toMillis();
    await db.doc(parentPath).update({ checksum: `${String(parentBefore?.checksum)}-tampered` });
    const parentReport = await currentReport();
    expect(parentReport.passed).toBe(false);
    expect(failed(parentReport, "checksums").paths).toContain(parentPath);
    expect((await db.doc(parentPath).get()).updateTime?.toMillis()).not.toBe(marker);
    await db.doc(parentPath).set(parentBefore ?? {});
    const afterParentRestore = (await db.doc(versionPath).get()).updateTime?.toMillis();
    const parentMillis = (await db.doc(parentPath).get()).updateTime?.toMillis();
    await db.doc(versionPath).update({ checksum: `${String(versionBefore?.checksum)}-tampered` });
    const versionReport = await currentReport();
    expect(versionReport.passed).toBe(false);
    expect(failed(versionReport, "snapshots").paths).toContain(versionPath);
    expect((await db.doc(versionPath).get()).data()?.checksum).toBe(`${String(versionBefore?.checksum)}-tampered`);
    expect((await db.doc(parentPath).get()).updateTime?.toMillis()).toBe(parentMillis);
    await db.doc(versionPath).set(versionBefore ?? {});
    expect((await db.doc(versionPath).get()).updateTime?.toMillis()).not.toBe(afterParentRestore);
    const quiet = (await db.doc(parentPath).get()).updateTime?.toMillis();
    const again = await currentReport();
    expect(again.passed, again.checks.filter((item) => !item.passed).map((item) => item.name).join(",")).toBe(true);
    expect((await db.doc(parentPath).get()).updateTime?.toMillis()).toBe(quiet);
  });

  it("rejects a missing, duplicate, or mismatched audit", async () => {
    const auditPath = `${AUDIT}/${auditDocId(RUN_ID, "EX-L001")}`;
    const original = (await db.doc(auditPath).get()).data();
    const marker = (await db.doc(`${OBJECTS}/EX-L001`).get()).updateTime?.toMillis();
    await db.doc(auditPath).delete();
    const missing = await currentReport();
    expect(missing.passed).toBe(false);
    expect(failed(missing, "auditIntegrity").paths).toContain(auditPath);
    expect((await db.doc(`${OBJECTS}/EX-L001`).get()).updateTime?.toMillis()).toBe(marker);
    await db.doc(auditPath).set(original ?? {});

    const extraPath = `${AUDIT}/${auditDocId(RUN_ID, "EX-L001")}-extra`;
    await db.doc(extraPath).set({ ...(original ?? {}), result: "ok", runId: RUN_ID, target: { ...(original?.target as object), id: "EX-L001" } });
    const duplicate = await currentReport();
    expect(duplicate.passed).toBe(false);
    expect(failed(duplicate, "auditIntegrity").paths).toContain(extraPath);
    await db.doc(extraPath).delete();

    await db.doc(auditPath).update({ checksum: "mismatch" });
    const mismatched = await currentReport();
    expect(mismatched.passed).toBe(false);
    expect(failed(mismatched, "auditIntegrity").paths).toContain(auditPath);
    await db.doc(auditPath).set(original ?? {});
    expect((await currentReport()).passed).toBe(true);
  });

  it("rejects a migration that is not completed", async () => {
    const ref = db.doc(`${MIGRATIONS}/${RUN_ID}`);
    const original = (await ref.get()).data();
    await ref.update({ status: "running" });
    const report = await currentReport();
    expect(report.passed).toBe(false);
    expect(failed(report, "migrationStatus").passed).toBe(false);
    await ref.set(original ?? {});
  });

  it("rejects an unknown catalog path and an orphan version", async () => {
    const unknown = `${ROOT}/trainingCatalogKnowledgeArticles/unknown-article`;
    await db.doc(unknown).set({ marker: "extra" });
    const unknownReport = await currentReport();
    expect(unknownReport.passed).toBe(false);
    expect(failed(unknownReport, "catalogPaths").paths).toContain(unknown);
    expect((await db.doc(unknown).get()).exists).toBe(true);
    await db.doc(unknown).delete();

    const orphan = `${OBJECTS}/ORPHAN/versions/${CONTENT_VERSION}`;
    await db.doc(orphan).set({ marker: "orphan" });
    const orphanReport = await currentReport();
    expect(orphanReport.passed).toBe(false);
    expect(failed(orphanReport, "orphanVersions").paths).toContain(orphan);
    await db.doc(orphan).delete();
    await db.recursiveDelete(db.doc(`${OBJECTS}/ORPHAN`));
    expect((await currentReport()).passed).toBe(true);
  });

  it("rejects a business document whose content changed while the count stayed the same", async () => {
    const beforeCount = (await snapshotBusiness(db)).documents.length;
    await db.doc(USER_PATH).update({ displayName: "Changed Athlete" });
    const after = await snapshotBusiness(db);
    expect(after.documents.length).toBe(beforeCount);
    const report = await currentReport();
    expect(report.passed).toBe(false);
    expect(failed(report, "businessUnchanged").paths).toEqual([USER_PATH]);
    expect(JSON.stringify(report)).not.toContain("Changed Athlete");
    await db.doc(USER_PATH).update({ displayName: "Verify Athlete" });
    expect((await currentReport()).passed).toBe(true);
  });

  it("does not open production from the verification command", () => {
    const child = spawnSync(process.execPath, [
      path.join(rootDir, "scripts/catalog/verify-import.mjs"),
      "--project",
      "skatingx-prod",
      "--runId",
      RUN_ID,
    ], { cwd: rootDir, encoding: "utf8", env: { ...process.env, SKATINGX_IMPORT_VERIFY: "" } });
    expect(child.status).not.toBe(0);
    expect(child.stderr).toMatch(/refusing production verification/);
    expect(child.stdout).toBe("");
    const production = evaluateCatalogImport({
      mode: "production",
      runId: RUN_ID,
      projectId: "skatingx-prod",
      databaseId: "(default)",
      gitHead: "verify-git",
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      migration: null,
      plans: [],
      stored: [],
      inspected: { collectionDocs: {}, orphans: [], versionPaths: [] },
      audits: [],
      business: { countBefore: 1, countAfter: 1, changes: [] },
      rules: { skipped: true },
      idempotency: { skipped: true, invoked: false },
    });
    expect(production.idempotency).toMatchObject({ mode: "read-only", invoked: false });
    expect(failed(production, "idempotency").passed).toBe(true);
    expect(production.passed).toBe(false);
  });
});
