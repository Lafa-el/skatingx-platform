// Cross-process crash window for catalog lock recovery. The emulator host comes from the parent test.
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const {
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  beginRun,
  executeImport,
  loadPlans,
  recoverImportLock,
} = await import("./import-core.mjs");
const { evaluateCatalogImport, readCatalogVerification, checkDraftReads, businessReport } = await import("./verify-catalog.mjs");
const { snapshotBusiness } = await import("./backup-prod.mjs");

const mode = process.argv[2];
const runId = process.argv[3];
const projectId = "demo-skatingx-import";
const app = initializeApp({ projectId }, `recovery-window-${process.pid}`);
const db = getFirestore(app);

if (mode === "hold") {
  await beginRun(db, { runId, workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, gitSha: "recovery-window", initial: true });
} else if (mode === "recover-exit") {
  await recoverImportLock(db, { runId, actor: IMPORT_ACTOR, reason: "holder crashed", confirmHolderDead: true });
} else if (mode === "adopt-exit") {
  await beginRun(db, { runId, workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, gitSha: "recovery-window" });
} else if (mode === "resume-verify") {
  const before = await snapshotBusiness(db);
  const run = await beginRun(db, { runId, workbookSha256: EXPECTED_WORKBOOK_SHA256, actor: IMPORT_ACTOR, gitSha: "recovery-window" });
  const { plans } = loadPlans(run.importedAt);
  await executeImport(db, plans, {
    runId: run.runId,
    importedAt: run.importedAt,
    actor: run.actor,
    lockToken: run.lockToken,
  });
  const read = await readCatalogVerification(db, runId, "emulator");
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "").split(":");
  const rules = await checkDraftReads({
    host,
    port,
    projectId,
    draftPath: "artifacts/skatingx-production/trainingCatalogObjects/EX-L039",
  });
  const report = evaluateCatalogImport({
    mode: "emulator",
    runId,
    projectId: read.projectId,
    databaseId: read.databaseId,
    gitHead: run.gitSha ?? "recovery-window",
    workbookSha256: EXPECTED_WORKBOOK_SHA256,
    migration: read.migration,
    plans: read.plans,
    stored: read.stored,
    inspected: read.inspected,
    audits: read.audits,
    lock: read.lock,
    business: businessReport(before, await snapshotBusiness(db)),
    rules,
    idempotency: { skipped: false, readOnly: true, actualContentWrites: 0, actualAuditWrites: 0 },
  });
  process.stdout.write(`${JSON.stringify({ acceptance: report.acceptance, passed: report.passed, status: read.migration?.status })}\n`);
} else {
  throw new Error(`unknown recovery window mode ${mode}`);
}
