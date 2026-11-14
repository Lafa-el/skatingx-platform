import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ALLOWED_PRODUCTION_SERVICE_ACCOUNTS,
  confirmProjectOnStdin,
} from "../../scripts/catalog/import-guard.mjs";
import {
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  auditDocId,
  beginRun,
  importLockPath,
  readPlannedDocs,
  rollbackImport,
} from "../../scripts/catalog/import-core.mjs";
import { buildImportPlan, runImportEntry, type ImportRequest } from "../../scripts/catalog/import-runner.mjs";
import {
  businessReport,
  checkDraftReads,
  evaluateCatalogImport,
  readCatalogVerification,
  verificationActions,
} from "../../scripts/catalog/verify-catalog.mjs";
import { snapshotBusiness } from "../../scripts/catalog/backup-prod.mjs";

const PROJECT_ID = "demo-skatingx-runner";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const MIGRATIONS = `${ROOT}/trainingCatalogMigrations`;
const SENTINEL = `${ROOT}/users/runner-sentinel`;
const RUN_ID = "run-shared-runner";
const SECRET = "synthetic-test-key";
const FIXTURE_EMAIL = "import@skatingx-prod.iam.gserviceaccount.com";
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

function productionRequest(overrides: Partial<ImportRequest> = {}): ImportRequest {
  return {
    target: "production",
    project: "skatingx-prod",
    confirm: "skatingx-prod",
    mode: "initial",
    runId: "prod-run",
    execute: true,
    actor: IMPORT_ACTOR,
    databaseId: "(default)",
    ...overrides,
  };
}

function trackedDeps(overrides: Partial<Parameters<typeof runImportEntry>[1]> = {}) {
  const calls = { open: 0, read: 0, write: 0, describe: 0 };
  const logs: string[] = [];
  const db = {
    doc() {
      return {
        get: async () => {
          calls.read += 1;
          return { exists: false, data: () => ({}) };
        },
        set: async () => {
          calls.write += 1;
        },
      };
    },
    batch() {
      return {
        set() {
          calls.write += 1;
        },
        create() {
          calls.write += 1;
        },
        commit: async () => {
          calls.write += 1;
        },
      };
    },
    collection() {
      return {
        get: async () => {
          calls.read += 1;
          return { size: 0, docs: [] };
        },
      };
    },
  };
  const deps = {
    emulatorHost: "",
    now: () => new Date("2026-11-14T00:00:00.000Z"),
    openFirestore: async () => {
      calls.open += 1;
      return db;
    },
    credentialProvider: {
      source: "test-fixture",
      async describe() {
        calls.describe += 1;
        return {
          type: "service_account",
          clientEmail: FIXTURE_EMAIL,
          projectId: "skatingx-prod",
          privateKey: SECRET,
        };
      },
    },
    allowedEmails: [FIXTURE_EMAIL] as readonly string[] | undefined,
    confirmProject: async () => {},
    writeSummary: (text: string) => {
      logs.push(text);
    },
    writeReport: (value: Record<string, unknown>) => {
      logs.push(JSON.stringify(value));
    },
    gitSha: () => "runner-git",
    ...overrides,
  };
  return { calls, logs, deps };
}

describe("shared import runner", () => {
  it("builds one plan for emulator and production, independent of importedAt", () => {
    const left = buildImportPlan("2026-11-14T00:00:00.000Z", "run-shared");
    const right = buildImportPlan("2026-11-14T00:00:00.000Z", "run-shared");
    const later = buildImportPlan("2026-11-15T00:00:00.000Z", "run-shared");
    expect(left.parentPaths).toEqual(right.parentPaths);
    expect(left.versionPaths).toEqual(right.versionPaths);
    expect(left.parentPaths).toHaveLength(257);
    expect(left.versionPaths).toHaveLength(257);
    expect(JSON.stringify(left.plans)).toBe(JSON.stringify(right.plans));
    expect(left.checksums).toEqual(later.checksums);
    expect(left.planSummary.digest).toBe(later.planSummary.digest);
    expect(left.parentPaths).toEqual(later.parentPaths);
    expect(left.versionPaths).toEqual(later.versionPaths);
    expect(left.refs).toEqual({ blockToDrill: 115, sessionToBlock: 57, total: 172, emptyDrills: 68 });
    expect(left.baseBudget).toBe(772);
    expect(left.migrationId).toBe("run-shared");
    expect(left.migrationPath).toBe(`${MIGRATIONS}/run-shared`);
    expect(left.auditIds).toEqual(later.auditIds);
    expect(left.auditIds[0]).toBe(auditDocId("run-shared", String(left.checksums[0]?.id)));
    expect(left.plans[0]?.data.createdAt).toBe("2026-11-14T00:00:00.000Z");
    expect(later.plans[0]?.data.createdAt).toBe("2026-11-15T00:00:00.000Z");
    expect(JSON.stringify(left.plans)).not.toBe(JSON.stringify(later.plans));
  });

  it("returns the same plan from a production preflight without opening Firestore", async () => {
    const planned = buildImportPlan("2026-11-14T00:00:00.000Z", "run-shared");
    const tracked = trackedDeps();
    const outcome = await runImportEntry(productionRequest({ execute: false, runId: "run-shared" }), tracked.deps);
    expect(tracked.calls).toEqual({ open: 0, read: 0, write: 0, describe: 0 });
    expect(outcome.plan?.planSummary.digest).toBe(planned.planSummary.digest);
    expect(outcome.plan?.parentPaths).toEqual(planned.parentPaths);
    expect(outcome.plan?.checksums).toEqual(planned.checksums);
    expect(outcome.publicReport).toMatchObject({
      phase: "preflight",
      target: "production",
      writes: 0,
      planDigest: planned.planSummary.digest,
      baseBudget: 772,
      parents: 257,
      versions: 257,
      identity: "unverified",
    });
  });

  it("refuses every production guard mismatch and still closes the connection when they all pass", async () => {
    expect(ALLOWED_PRODUCTION_SERVICE_ACCOUNTS).toEqual([]);
    const runnerSource = readFileSync(path.join(rootDir, "scripts/catalog/import-runner.mjs"), "utf8");
    const coreSource = readFileSync(path.join(rootDir, "scripts/catalog/import-core.mjs"), "utf8");
    expect(runnerSource).toContain("assertProductionConnectionDisabled()");
    expect(runnerSource).not.toContain("initializeApp");
    expect(coreSource).toContain("batch.create");
    expect(coreSource).not.toContain("batch.set");

    const cases: Array<{ name: string; request?: Partial<ImportRequest>; deps?: Partial<Parameters<typeof runImportEntry>[1]>; message: RegExp; described: number }> = [
      { name: "project", request: { project: "other-project", confirm: "other-project" }, message: /skatingx-prod/, described: 0 },
      { name: "database", request: { databaseId: "other-db" }, message: /database id must be \(default\)/, described: 0 },
      { name: "confirm", request: { confirm: "not-the-project" }, message: /--confirm must equal/, described: 0 },
      {
        name: "stdin",
        deps: { confirmProject: (projectId: string) => confirmProjectOnStdin(projectId, async () => "wrong-project") },
        message: /stdin confirmation/,
        described: 1,
      },
      { name: "emulator host", deps: { emulatorHost: "127.0.0.1:8080" }, message: /FIRESTORE_EMULATOR_HOST/, described: 0 },
      {
        name: "credential type",
        deps: { credentialProvider: { source: "test-fixture", async describe() { return { type: "authorized_user", clientEmail: FIXTURE_EMAIL, projectId: "skatingx-prod", privateKey: SECRET }; } } },
        message: /service_account/,
        described: 0,
      },
      {
        name: "missing email",
        deps: { credentialProvider: { source: "test-fixture", async describe() { return { type: "service_account", clientEmail: " ", projectId: "skatingx-prod", privateKey: SECRET }; } } },
        message: /email is missing/,
        described: 0,
      },
      {
        name: "credential project",
        deps: { credentialProvider: { source: "test-fixture", async describe() { return { type: "service_account", clientEmail: FIXTURE_EMAIL, projectId: "other-project", privateKey: SECRET }; } } },
        message: /does not match the target project/,
        described: 0,
      },
      { name: "not allowed", deps: { allowedEmails: ["other@example.com"] }, message: /not allowed/, described: 1 },
      { name: "empty allowlist", deps: { allowedEmails: undefined }, message: /not allowed/, described: 1 },
    ];

    for (const item of cases) {
      const tracked = trackedDeps(item.deps);
      await expect(runImportEntry(productionRequest(item.request), tracked.deps), item.name).rejects.toThrow(item.message);
      expect(tracked.calls.open, item.name).toBe(0);
      expect(tracked.calls.read, item.name).toBe(0);
      expect(tracked.calls.write, item.name).toBe(0);
      if (item.described === 0) expect(tracked.calls.describe, item.name).toBe(0);
      expect(tracked.logs.join("\n"), item.name).not.toContain(SECRET);
    }

    const skipped = trackedDeps();
    const preview = await runImportEntry(productionRequest({ execute: false }), skipped.deps);
    expect(preview.publicReport?.writes).toBe(0);
    expect(skipped.calls).toEqual({ open: 0, read: 0, write: 0, describe: 0 });

    const ready = trackedDeps();
    await expect(runImportEntry(productionRequest(), ready.deps)).rejects.toThrow(/production Firestore connection is disabled/);
    expect(ready.calls).toMatchObject({ open: 0, read: 0, write: 0, describe: 1 });
    expect(ready.logs.join("\n")).not.toContain(SECRET);
    expect(JSON.stringify(ready.calls)).not.toContain(SECRET);
  });
});

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-import-runner");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-import-runner");
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

describe.sequential("shared runner emulator chain", () => {
  const db = openFirestore();
  const sentinel = { displayName: "Runner Sentinel", marker: 1 };
  let importedAt = "";
  let firstToken = "";
  let fingerprint = "";

  beforeAll(async () => {
    await wipeCatalog(db);
    await db.doc(SENTINEL).set(sentinel);
  });

  afterAll(async () => {
    await wipeCatalog(db);
    await db.doc(SENTINEL).delete();
  });

  function entryDeps() {
    return {
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
      openFirestore: async () => db,
      gitSha: () => "runner-git",
      writeSummary: () => {},
      writeReport: () => {},
    };
  }

  it("imports the frozen catalog through the shared runner", async () => {
    const before = await snapshotBusiness(db);
    const outcome = await runImportEntry({
      target: "emulator",
      project: PROJECT_ID,
      confirm: "",
      mode: "initial",
      runId: RUN_ID,
      execute: true,
      actor: IMPORT_ACTOR,
      databaseId: "(default)",
    }, entryDeps());
    importedAt = outcome.importedAt ?? "";
    firstToken = outcome.lockToken ?? "";
    expect(firstToken).not.toBe("");
    expect(outcome.publicReport).toMatchObject({
      plannedContentWrites: 514,
      plannedAuditWrites: 257,
      actualContentWrites: 514,
      actualAuditWrites: 257,
      runStatus: "completed",
    });
    expect(outcome.plan?.parentPaths).toHaveLength(257);
    expect(outcome.plan?.versionPaths).toHaveLength(257);
    expect((await readPlannedDocs(db, outcome.plan?.plans ?? [])).size).toBe(514);
    const audits = await db.collection(AUDIT).get();
    expect(audits.size).toBe(257);
    expect(new Set(audits.docs.map((doc) => doc.id)).size).toBe(257);
    expect(audits.docs.every((doc) => doc.id.startsWith(`imp-${RUN_ID}-`) && doc.data().result === "ok")).toBe(true);
    const migration = (await db.doc(`${MIGRATIONS}/${RUN_ID}`).get()).data();
    expect(migration?.status).toBe("completed");
    expect(migration?.planSummary?.digest).toBe(buildImportPlan(importedAt, RUN_ID).planSummary.digest);
    const lock = (await db.doc(importLockPath()).get()).data();
    expect(lock?.status).toBe("released");
    expect(lock?.token).toBe(firstToken);
    expect((await db.doc(SENTINEL).get()).data()).toEqual(sentinel);
    const after = await snapshotBusiness(db);
    expect(after.documents.find((item) => item.path === SENTINEL)?.sha256).toBe(
      before.documents.find((item) => item.path === SENTINEL)?.sha256,
    );
  });

  it("reads the import back without writing", async () => {
    const sample = await db.doc(`${OBJECTS}/EX-L001`).get();
    const beforeTime = sample.updateTime?.toMillis();
    const migrationBefore = (await db.doc(`${MIGRATIONS}/${RUN_ID}`).get()).updateTime?.toMillis();
    const read = await readCatalogVerification(db, RUN_ID);
    const businessBefore = await snapshotBusiness(db);
    const rulesAddress = (process.env.FIRESTORE_EMULATOR_HOST ?? "").split(":");
    const rules = await checkDraftReads({
      host: rulesAddress[0] ?? "",
      port: rulesAddress[1] ?? "",
      projectId: PROJECT_ID,
      draftPath: `${OBJECTS}/EX-L039`,
    });
    const report = evaluateCatalogImport({
      mode: "emulator",
      runId: RUN_ID,
      projectId: read.projectId,
      databaseId: read.databaseId,
      gitHead: "runner-git",
      workbookSha256: read.migration?.workbookSha256 as string,
      migration: read.migration,
      plans: read.plans,
      stored: read.stored,
      inspected: read.inspected,
      audits: read.audits,
      business: businessReport(businessBefore, await snapshotBusiness(db)),
      rules,
      idempotency: { skipped: true },
    });
    const problems = report.checks.filter((item) => item.status !== "skipped" && !item.passed).map((item) => `${item.name}: ${item.detail}`);
    expect(problems, problems.join("; ")).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.counts).toMatchObject({ exercise: 120, drill: 68, block: 51, session: 18, refs: 172, audits: 257 });
    expect(report.idempotency).toMatchObject({ invoked: false });
    expect(verificationActions("emulator")).toEqual({ resume: false, rulesClient: true, writes: false });
    expect(rules).toEqual({ anonymous: "denied", signedIn: "denied", admin: "allowed" });
    expect((await db.doc(`${OBJECTS}/EX-L001`).get()).updateTime?.toMillis()).toBe(beforeTime);
    expect((await db.doc(`${MIGRATIONS}/${RUN_ID}`).get()).updateTime?.toMillis()).toBe(migrationBefore);
    const parents = await db.collection(OBJECTS).get();
    fingerprint = JSON.stringify(parents.docs.map((doc) => ({
      path: doc.ref.path,
      checksum: doc.data().checksum,
      updatedAt: doc.data().updatedAt,
      updateTime: doc.updateTime?.toMillis() ?? 0,
    })).sort((left, right) => (left.path < right.path ? -1 : 1)));
  });

  it("resumes the same run without new content or audit writes", async () => {
    const outcome = await runImportEntry({
      target: "emulator",
      project: PROJECT_ID,
      confirm: "",
      mode: "resume",
      runId: RUN_ID,
      execute: true,
      actor: IMPORT_ACTOR,
      databaseId: "(default)",
    }, entryDeps());
    expect(outcome.publicReport).toMatchObject({ actualContentWrites: 0, actualAuditWrites: 0, idempotent: true, runStatus: "completed" });
    const child = spawnSync(process.execPath, [
      path.join(rootDir, "scripts/catalog/check-idempotency.mjs"),
      "--runId", RUN_ID,
      "--target", "emulator",
      "--project", PROJECT_ID,
    ], { cwd: rootDir, encoding: "utf8", env: process.env });
    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    expect(JSON.parse(child.stdout)).toMatchObject({ actualContentWrites: 0, actualAuditWrites: 0, passed: true });
    const parents = await db.collection(OBJECTS).get();
    const again = JSON.stringify(parents.docs.map((doc) => ({
      path: doc.ref.path,
      checksum: doc.data().checksum,
      updatedAt: doc.data().updatedAt,
      updateTime: doc.updateTime?.toMillis() ?? 0,
    })).sort((left, right) => (left.path < right.path ? -1 : 1)));
    expect(again).toBe(fingerprint);
    expect((await db.doc(SENTINEL).get()).data()).toEqual(sentinel);
    expect((await db.doc(`${MIGRATIONS}/${RUN_ID}`).get()).data()?.status).toBe("completed");
  });

  it("rolls back through the current lock token and refuses resume", async () => {
    const lock = (await db.doc(importLockPath()).get()).data();
    expect(lock?.status).toBe("released");
    expect(typeof lock?.token).toBe("string");
    expect(lock?.token).not.toBe(firstToken);
    expect(lock?.token).not.toBe("forged-token");
    await expect(rollbackImport(db, RUN_ID, { lockToken: "forged-token" })).rejects.toThrow(/lock is not held/);
    const rolled = await rollbackImport(db, RUN_ID, { lockToken: String(lock?.token) });
    expect(rolled.rollbackResult).toEqual({ deletedParents: 257, deletedSnapshots: 257, retainedAudits: 257 });
    expect((await db.collection(OBJECTS).listDocuments())).toHaveLength(0);
    expect((await db.collection(AUDIT).get()).size).toBe(257);
    expect((await db.doc(`${MIGRATIONS}/${RUN_ID}`).get()).data()?.status).toBe("rolled_back");
    expect((await db.doc(importLockPath()).get()).data()?.status).toBe("rolled_back");
    expect((await db.doc(SENTINEL).get()).data()).toEqual(sentinel);
    await expect(beginRun(db, { runId: RUN_ID, workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR })).rejects.toThrow(/rolled_back/);
    await expect(runImportEntry({
      target: "emulator",
      project: PROJECT_ID,
      confirm: "",
      mode: "resume",
      runId: RUN_ID,
      execute: true,
      actor: IMPORT_ACTOR,
      databaseId: "(default)",
    }, entryDeps())).rejects.toThrow(/rolled_back/);
  });
});
