// Read-only catalog acceptance. This command never starts an import and never writes.
// Idempotency is checked by scripts/catalog/check-idempotency.mjs, not here.
// Production reads require SKATINGX_IMPORT_VERIFY=allow and no emulator host.
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const { evaluateCatalogImport, readCatalogVerification, checkDraftReads, businessReport, verificationActions } = await import("./verify-catalog.mjs");
const { loadBusinessBaseline, snapshotBusiness } = await import("./backup-prod.mjs");

function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const projectId = argument("--project") ?? "";
  const runId = argument("--runId") ?? "";
  const gitHead = argument("--git-head") ?? "";
  const workbookSha256 = argument("--workbook-sha256") ?? "";
  if (projectId === "skatingx-prod") {
    if (process.env.SKATINGX_IMPORT_VERIFY !== "allow") {
      throw new Error("refusing production verification without SKATINGX_IMPORT_VERIFY=allow");
    }
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("refusing production verification while FIRESTORE_EMULATOR_HOST is set");
    }
  } else if (!projectId.startsWith("demo-") || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("refusing verification outside a demo- emulator");
  }
  const mode = projectId === "skatingx-prod" ? "production" : "emulator";
  const actions = verificationActions(mode);
  const baselinePath = argument("--business-baseline");
  if (mode === "production" && !baselinePath) {
    throw new Error("refusing production verification without a business baseline");
  }
  const app = initializeApp({ projectId }, `catalog-verify-${runId}`);
  const db = getFirestore(app);
  const read = await readCatalogVerification(db, runId, mode);
  const after = await snapshotBusiness(db);
  const before = baselinePath
    ? loadBusinessBaseline(baselinePath, { requireEncrypted: mode === "production" })
    : after;
  const business = businessReport(before, after);
  const rules = actions.rulesClient
    ? await checkDraftReads({
      host: (process.env.FIRESTORE_EMULATOR_HOST ?? "").split(":")[0],
      port: (process.env.FIRESTORE_EMULATOR_HOST ?? "").split(":")[1],
      projectId,
      draftPath: "artifacts/skatingx-production/trainingCatalogObjects/EX-L039",
    })
    : { skipped: true };
  const report = evaluateCatalogImport({
    mode,
    runId,
    projectId: read.projectId,
    databaseId: read.databaseId,
    gitHead,
    workbookSha256,
    migration: read.migration,
    plans: read.plans,
    stored: read.stored,
    inspected: read.inspected,
    audits: read.audits,
    business,
    rules,
    idempotency: { skipped: true, invoked: false },
  });
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
