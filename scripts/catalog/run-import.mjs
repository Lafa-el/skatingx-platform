// One catalog import against the Firestore emulator.
// Production guards (project allowlist, confirmation, read-only preflight) are later.
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const loaderPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "typescript-loader.mjs");
await register(pathToFileURL(loaderPath).href, { parentURL: import.meta.url });

const {
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  assertDemoProjectId,
  beginRun,
  importDocuments,
  loadPlans,
} = await import("./import-core.mjs");

function parseArgs(argv) {
  const args = { runId: "", project: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--runId") args.runId = argv[(index += 1)] ?? "";
    else if (token === "--project") args.project = argv[(index += 1)] ?? "";
    else throw new Error(`unknown argument ${token}`);
  }
  if (args.runId === "") throw new Error("--runId is required");
  if (args.project === "") throw new Error("--project is required");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertDemoProjectId(args.project);
  const app = initializeApp({ projectId: args.project }, `catalog-run-import-${args.runId}`);
  const db = getFirestore(app);
  const run = await beginRun(db, { runId: args.runId, workbookSha256: EXPECTED_WORKBOOK_SHA256 });
  const { plans } = loadPlans(run.importedAt);
  const writes = await importDocuments(db, plans, {
    runId: run.runId,
    importedAt: run.importedAt,
    actor: IMPORT_ACTOR,
  });
  console.log(`writes: ${writes}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
