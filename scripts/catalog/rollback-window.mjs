// Second-process rollback. Process A leaves a rollback lock held. Process B recovers it and finishes.
import { spawnSync } from "node:child_process";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const { EXPECTED_WORKBOOK_SHA256 } = await import("./import-core.mjs");
const { runImportEntry } = await import("./import-runner.mjs");

const mode = process.argv[2];
const runId = process.argv[3];
const projectId = "demo-skatingx-import";
const app = initializeApp({ projectId }, `rollback-window-${process.pid}`);
const db = getFirestore(app);

function deps() {
  return {
    emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    openFirestore: async () => db,
    confirmProject: async () => projectId,
    gitSha: () => "rollback-window",
    writeReport: () => {},
  };
}

const request = {
  target: "emulator",
  project: projectId,
  confirm: projectId,
  actor: "catalog-import",
  databaseId: "(default)",
  runId,
};

if (mode === "import") {
  await runImportEntry({ ...request, mode: "initial", execute: true }, deps());
} else if (mode === "crash-rollback" || mode === "crash-snapshots" || mode === "crash-parents" || mode === "crash-before-mark" || mode === "crash-after-mark" || mode === "crash-after-commit") {
  const crashes = {
    "crash-rollback": { crashAfterLock: true, needle: "injected rollback holder crash" },
    "crash-snapshots": { crashAfterSnapshots: 1, needle: "injected rollback crash after snapshots" },
    "crash-parents": { crashAfterParents: 1, needle: "injected rollback crash after parents" },
    "crash-before-mark": { crashBeforeMark: true, needle: "injected rollback crash before mark" },
    "crash-after-mark": { crashAfterMark: true, needle: "injected rollback crash after mark" },
    "crash-after-commit": { crashAfterCommit: true, needle: "injected rollback response loss" },
  };
  const crash = crashes[mode];
  const { needle, ...flags } = crash;
  try {
    await runImportEntry({ ...request, mode: "initial", execute: false, rollback: true, ...flags }, deps());
    throw new Error(`${mode} did not crash`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(needle)) throw error;
    process.stdout.write(`${JSON.stringify({ crashed: mode === "crash-rollback" ? true : mode })}\n`);
  }
} else if (mode === "verify-rollback") {
  const objects = await db.collection("artifacts/skatingx-production/trainingCatalogObjects").listDocuments();
  const audits = await db.collection("artifacts/skatingx-production/trainingCatalogAuditLogs").get();
  const migration = (await db.doc(`artifacts/skatingx-production/trainingCatalogMigrations/${runId}`).get()).data() ?? {};
  const counts = migration.rollbackResult ?? {};
  const objectAudits = audits.docs.filter((doc) => doc.id.startsWith(`imp-${runId}-`) && doc.data().result === "ok");
  const report = {
    contentRemaining: objects.length,
    objectAudits: objectAudits.length,
    status: migration.status ?? null,
    deletedParents: counts.deletedParents ?? null,
    deletedSnapshots: counts.deletedSnapshots ?? null,
    controlUpdates: counts.controlUpdates ?? null,
    totalOperations: counts.totalOperations ?? null,
    controlWrites: counts.controlWrites ?? null,
  };
  const consistent = report.contentRemaining === 0
    && report.objectAudits === 257
    && report.status === "rolled_back"
    && report.deletedParents === 257
    && report.deletedSnapshots === 257
    && report.totalOperations === 514 + report.controlUpdates
    && report.controlWrites === report.totalOperations;
  process.stdout.write(`${JSON.stringify({ ...report, consistent })}\n`);
  if (!consistent) process.exit(1);
} else if (mode === "reject-join") {
  try {
    await runImportEntry({ ...request, mode: "initial", execute: false, rollback: true }, deps());
    throw new Error("old token process joined the rollback");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("rollback holder must be recovered explicitly")) throw error;
    process.stdout.write(`${JSON.stringify({ joined: false })}\n`);
  }
} else if (mode === "recover") {
  const outcome = await runImportEntry({
    ...request,
    mode: "resume",
    execute: true,
    recoverLock: true,
    recoverReason: "holder crashed",
  }, deps());
  process.stdout.write(`${JSON.stringify(outcome.publicReport)}\n`);
} else if (mode === "finish") {
  const outcome = await runImportEntry({ ...request, mode: "initial", execute: false, rollback: true }, deps());
  const verify = spawnSync(process.execPath, [
    path.join(here, "verify-import.mjs"),
    "--project", projectId,
    "--runId", runId,
    "--git-head", "rollback-window",
    "--workbook-sha256", EXPECTED_WORKBOOK_SHA256,
  ], { cwd: path.resolve(here, "../.."), encoding: "utf8", env: process.env });
  const report = verify.stdout ? JSON.parse(verify.stdout) : null;
  process.stdout.write(`${JSON.stringify({
    rollback: outcome.publicReport,
    acceptance: report?.acceptance ?? null,
    migrationStatus: report?.migration?.status ?? null,
    verifyStatus: verify.status,
  })}\n`);
  if (!report) {
    process.stderr.write(verify.stderr ?? "");
    process.exit(1);
  }
} else {
  throw new Error(`unknown rollback window mode ${mode}`);
}
