// Catalog import CLI. Emulator writes are allowed only for demo- projects.
// Production mode stops before opening Firestore.
import { execFileSync } from "node:child_process";
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
  assertResumeIdentity,
  assertResumeCatalog,
  beginRun,
  executeImport,
  loadPlans,
  planSummary,
  preflightInitial,
} = await import("./import-core.mjs");
const {
  assertExecutionTarget,
  assertProductionConnectionDisabled,
  confirmProjectOnStdin,
  countBusinessData,
  formatExecutionSummary,
  parseImportArgs,
  readLineFromStdin,
  resolveAuthUserCount,
} = await import("./import-guard.mjs");

const rootDir = path.resolve(here, "../..");

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
}

function databaseIdOf(db) {
  if (typeof db.databaseId === "string" && db.databaseId !== "") return db.databaseId;
  const settings = db._settings;
  if (settings && typeof settings.databaseId === "string" && settings.databaseId !== "") {
    return settings.databaseId;
  }
  return "(default)";
}

function printBatchLog(report) {
  for (const batch of report.batches) {
    console.error(
      `batch ${batch.index} objects=${batch.objects} writes=${batch.writes} cumulativeContent=${batch.cumulativeContent} cumulativeAudits=${batch.cumulativeAudits}`,
    );
  }
}

async function businessSummary(db) {
  try {
    return await countBusinessData(db);
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const args = parseImportArgs(process.argv.slice(2));
  const actor = args.actor.trim() !== "" ? args.actor.trim() : IMPORT_ACTOR;
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (args.target === "production") {
    assertExecutionTarget({
      target: "production",
      projectId: args.project,
      confirm: args.confirm,
      emulatorHost,
      execute: args.execute,
      databaseId: "(default)",
    });
    if (args.execute) {
      await confirmProjectOnStdin(args.project, readLineFromStdin);
      // No environment variable is accepted as an identity. The connection stays
      // closed until a later step can verify a service account.
      assertProductionConnectionDisabled();
    }
    console.log(JSON.stringify({ phase: "preflight", target: "production", writes: 0 }));
    return;
  }
  assertExecutionTarget({
    target: "emulator",
    projectId: args.project,
    confirm: args.confirm,
    emulatorHost,
    execute: args.execute,
    databaseId: "(default)",
  });
  const app = initializeApp({ projectId: args.project }, `catalog-run-import-${args.runId}`);
  const db = getFirestore(app);
  const gitSha = gitHead();
  const authUsers = resolveAuthUserCount({
    status: "unavailable",
    reason: "catalog import does not query Firebase Auth",
  });
  const business = await businessSummary(db);
  if (!args.execute) {
    const preview = loadPlans(new Date().toISOString());
    if (args.mode === "initial") await preflightInitial(db, preview.plans);
    console.error(
      formatExecutionSummary({
        target: "emulator",
        projectId: args.project,
        databaseId: databaseIdOf(db),
        identity: "unverified emulator admin",
        runId: args.runId,
        mode: args.mode,
        actor,
        gitSha,
        workbookSha256: preview.workbookSha256,
        plannedContentWrites: 514,
        plannedAuditWrites: 257,
        plannedMigrationCreates: args.mode === "initial" ? 1 : 0,
        baseBudget: 772,
        authUsers,
        business,
      }),
    );
    console.log(JSON.stringify({ phase: "preflight", actualContentWrites: 0, actualAuditWrites: 0, actualMigrationWrites: 0 }));
    return;
  }
  if (args.mode === "initial") {
    const preview = loadPlans(new Date().toISOString());
    await preflightInitial(db, preview.plans);
    const run = await beginRun(db, {
      runId: args.runId,
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor,
      gitSha,
    });
    const { plans } = loadPlans(run.importedAt);
    const imported = await executeImport(db, plans, { runId: run.runId, importedAt: run.importedAt, actor: run.actor });
    const report = {
      ...imported,
      plannedMigrationCreates: run.created ? 1 : 0,
      actualMigrationWrites: (run.created ? 1 : 0) + imported.actualMigrationWrites,
    };
    printBatchLog(report);
    console.error(
      formatExecutionSummary({
        target: "emulator",
        projectId: args.project,
        databaseId: run.databaseId,
        identity: "unverified emulator admin",
        runId: run.runId,
        mode: "initial",
        actor: run.actor,
        gitSha: run.gitSha ?? gitSha,
        workbookSha256: run.workbookSha256,
        plannedContentWrites: report.plannedContentWrites,
        plannedAuditWrites: report.plannedAuditWrites,
        plannedMigrationCreates: report.plannedMigrationCreates,
        baseBudget: 772,
        authUsers,
        business,
      }),
    );
    console.log(JSON.stringify(report));
    return;
  }
  const existing = await db.doc(`artifacts/skatingx-production/trainingCatalogMigrations/${args.runId}`).get();
  if (!existing.exists) throw new Error(`migration ${args.runId} does not exist`);
  const loaded = loadPlans(existing.data().importedAt);
  const record = assertResumeIdentity(existing.data(), {
    actor,
    projectId: args.project,
    databaseId: databaseIdOf(db),
    workbookSha256: EXPECTED_WORKBOOK_SHA256,
    planSummary: planSummary(loaded.plans),
  });
  await assertResumeCatalog(db, loaded.plans, record.runId);
  const imported = await executeImport(db, loaded.plans, {
    runId: record.runId,
    importedAt: record.importedAt,
    actor: record.actor,
  });
  const report = { ...imported, plannedMigrationCreates: 0 };
  printBatchLog(report);
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
