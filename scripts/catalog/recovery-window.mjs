// Cross-process crash window. Each mode is a separate process using the shared runner.
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
const app = initializeApp({ projectId }, `recovery-window-${process.pid}`);
const db = getFirestore(app);

function deps() {
  return {
    emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    openFirestore: async () => db,
    confirmProject: async () => projectId,
    gitSha: () => "recovery-window",
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

if (mode === "hold") {
  await runImportEntry({ ...request, mode: "initial", execute: true, stopAfterLock: true }, deps());
} else if (mode === "recover-exit") {
  await runImportEntry({
    ...request,
    mode: "resume",
    execute: true,
    recoverLock: true,
    recoverReason: "holder crashed",
    stopAfterRecover: true,
  }, deps());
} else if (mode === "adopt-exit") {
  await runImportEntry({ ...request, mode: "resume", execute: true, stopAfterLock: true }, deps());
} else if (mode === "resume-verify") {
  await runImportEntry({ ...request, mode: "resume", execute: true }, deps());
  const verify = spawnSync(process.execPath, [
    path.join(here, "verify-import.mjs"),
    "--project", projectId,
    "--runId", runId,
    "--git-head", "recovery-window",
    "--workbook-sha256", EXPECTED_WORKBOOK_SHA256,
  ], { cwd: path.resolve(here, "../.."), encoding: "utf8", env: process.env });
  if (verify.status !== 0) {
    process.stderr.write(verify.stderr ?? "");
    process.stderr.write(verify.stdout ?? "");
    process.exit(verify.status ?? 1);
  }
  const report = JSON.parse(verify.stdout);
  process.stdout.write(`${JSON.stringify({ acceptance: report.acceptance, passed: report.passed, status: report.migration?.status })}\n`);
} else {
  throw new Error(`unknown recovery window mode ${mode}`);
}
