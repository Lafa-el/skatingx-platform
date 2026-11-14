// Shared catalog import orchestration.
//
// Emulator execution uses the Admin SDK through an injected connection.
// Production preparation uses the same planner and identity checks, then the
// caller hits assertProductionConnectionDisabled before any Firestore client
// is opened. Injected dependencies cannot replace that switch.
import {
  BASE_IMPORT_BUDGET,
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  assertResumeCatalog,
  assertResumeIdentity,
  auditDocId,
  beginRun,
  databaseIdOf,
  executeImport,
  loadPlans,
  planSummary,
  preflightInitial,
  previewImport,
} from "./import-core.mjs";
import {
  ALLOWED_PRODUCTION_SERVICE_ACCOUNTS,
  assertExecutionTarget,
  assertProductionConnectionDisabled,
  assertServiceAccountIdentity,
  countBusinessData,
  formatExecutionSummary,
  resolveAuthUserCount,
} from "./import-guard.mjs";

export function unconfiguredCredentialProvider() {
  return {
    source: "unconfigured",
    async describe() {
      return null;
    },
  };
}

function credentialView(credential) {
  if (!credential || typeof credential !== "object") return null;
  return {
    type: credential.type,
    clientEmail: credential.clientEmail,
    projectId: credential.projectId,
  };
}

export function buildImportPlan(importedAt, runId) {
  const loaded = loadPlans(importedAt);
  const summary = planSummary(loaded.plans);
  const parents = loaded.plans.filter((plan) => !plan.path.includes("/versions/"));
  const versions = loaded.plans.filter((plan) => plan.path.includes("/versions/"));
  let blockToDrill = 0;
  let sessionToBlock = 0;
  let emptyDrills = 0;
  for (const parent of parents) {
    const refs = Array.isArray(parent.data.refs) ? parent.data.refs : [];
    if (parent.data.kind === "drill" && refs.length === 0) emptyDrills += 1;
    if (parent.data.kind === "block") blockToDrill += refs.length;
    if (parent.data.kind === "session") sessionToBlock += refs.length;
  }
  return {
    importedAt,
    runId,
    workbookSha256: loaded.workbookSha256,
    plans: loaded.plans,
    parentPaths: parents.map((plan) => plan.path),
    versionPaths: versions.map((plan) => plan.path),
    checksums: parents.map((plan) => ({ id: plan.data.id, checksum: plan.data.checksum })),
    planSummary: summary,
    refs: { blockToDrill, sessionToBlock, total: blockToDrill + sessionToBlock, emptyDrills },
    baseBudget: BASE_IMPORT_BUDGET,
    migrationId: runId,
    migrationPath: `artifacts/skatingx-production/trainingCatalogMigrations/${runId}`,
    auditIds: parents.map((plan) => auditDocId(runId, String(plan.data.id))),
  };
}

function withDefaults(deps) {
  return {
    emulatorHost: deps.emulatorHost,
    now: deps.now ?? (() => new Date()),
    openFirestore: deps.openFirestore,
    credentialProvider: deps.credentialProvider ?? unconfiguredCredentialProvider(),
    confirmProject: deps.confirmProject,
    writeSummary: deps.writeSummary ?? ((text) => console.error(text)),
    writeReport: deps.writeReport ?? ((value) => console.log(JSON.stringify(value))),
    gitSha: deps.gitSha ?? (() => ""),
    allowedEmails: deps.allowedEmails,
    countBusiness: deps.countBusiness ?? countBusinessData,
  };
}

function actorOfRequest(request) {
  return request.actor.trim() !== "" ? request.actor.trim() : IMPORT_ACTOR;
}

async function businessSummary(db, countBusiness) {
  try {
    return await countBusiness(db);
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
}

async function resumeBudget(db, request, actor) {
  const existing = await db.doc(`artifacts/skatingx-production/trainingCatalogMigrations/${request.runId}`).get();
  if (!existing.exists) throw new Error(`migration ${request.runId} does not exist`);
  const storedAt = existing.data().importedAt;
  const loaded = buildImportPlan(storedAt, request.runId);
  const record = assertResumeIdentity(existing.data(), {
    actor,
    projectId: request.project,
    databaseId: databaseIdOf(db),
    workbookSha256: EXPECTED_WORKBOOK_SHA256,
    planSummary: loaded.planSummary,
  });
  await assertResumeCatalog(db, loaded.plans, record.runId);
  const preview = await previewImport(db, loaded.plans, {
    runId: record.runId,
    importedAt: record.importedAt,
    actor: record.actor,
  });
  return {
    ...preview,
    plans: loaded.plans,
    workbookSha256: loaded.workbookSha256,
    runId: record.runId,
    importedAt: record.importedAt,
    actor: record.actor,
  };
}

async function prepareProduction(request, deps) {
  const plan = buildImportPlan(deps.now().toISOString(), request.runId);
  if (!request.execute) {
    return {
      plan,
      publicReport: {
        phase: "preflight",
        target: "production",
        writes: 0,
        planDigest: plan.planSummary.digest,
        baseBudget: plan.baseBudget,
        parents: plan.parentPaths.length,
        versions: plan.versionPaths.length,
        identity: "unverified",
      },
    };
  }
  const described = await deps.credentialProvider.describe();
  const identityInput = {
    credential: credentialView(described),
    projectId: request.project,
  };
  if (deps.allowedEmails !== undefined) identityInput.allowedEmails = deps.allowedEmails;
  else identityInput.allowedEmails = ALLOWED_PRODUCTION_SERVICE_ACCOUNTS;
  const identity = assertServiceAccountIdentity(identityInput);
  if (typeof deps.confirmProject !== "function") {
    throw new Error("refusing to run: stdin confirmation is not configured");
  }
  await deps.confirmProject(request.project);
  return { plan, identity: { type: identity.type, clientEmail: identity.clientEmail, projectId: identity.projectId } };
}

async function runEmulator(request, deps) {
  if (typeof deps.openFirestore !== "function") {
    throw new Error("refusing to run: emulator connection is not configured");
  }
  const db = await deps.openFirestore(request.project);
  const actor = actorOfRequest(request);
  const gitSha = deps.gitSha();
  const authUsers = resolveAuthUserCount({
    status: "unavailable",
    reason: "catalog import does not query Firebase Auth",
  });
  const business = await businessSummary(db, deps.countBusiness);
  const summaryBase = {
    target: "emulator",
    projectId: request.project,
    databaseId: databaseIdOf(db),
    identity: "unverified emulator admin",
    runId: request.runId,
    mode: request.mode,
    actor,
    gitSha,
    authUsers,
    business,
    baseBudget: BASE_IMPORT_BUDGET,
  };
  if (!request.execute) {
    if (request.mode === "initial") {
      const preview = buildImportPlan(deps.now().toISOString(), request.runId);
      await preflightInitial(db, preview.plans);
      deps.writeSummary(formatExecutionSummary({
        ...summaryBase,
        workbookSha256: preview.workbookSha256,
        plannedContentWrites: 514,
        plannedAuditWrites: 257,
        plannedMigrationCreates: 1,
        remainingObjectGroups: 257,
      }));
    } else {
      const budget = await resumeBudget(db, request, actor);
      deps.writeSummary(formatExecutionSummary({
        ...summaryBase,
        actor: budget.actor,
        workbookSha256: budget.workbookSha256,
        plannedContentWrites: budget.plannedContentWrites,
        plannedAuditWrites: budget.plannedAuditWrites,
        plannedMigrationCreates: 0,
        remainingObjectGroups: budget.remainingObjectGroups,
      }));
      if (budget.mismatched.length > 0 || budget.incomplete.length > 0) {
        throw new Error(`resume refused: ${[...budget.mismatched, ...budget.incomplete].join("; ")}`);
      }
    }
    const publicReport = { phase: "preflight", actualContentWrites: 0, actualAuditWrites: 0, actualMigrationWrites: 0 };
    deps.writeReport(publicReport);
    return { publicReport };
  }
  if (request.mode === "initial") {
    const preview = buildImportPlan(deps.now().toISOString(), request.runId);
    await preflightInitial(db, preview.plans);
    const run = await beginRun(db, {
      runId: request.runId,
      workbookSha256: EXPECTED_WORKBOOK_SHA256,
      actor,
      gitSha,
      initial: true,
    });
    const planned = buildImportPlan(run.importedAt, run.runId);
    const imported = await executeImport(db, planned.plans, {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: run.actor,
      lockToken: run.lockToken,
    });
    const publicReport = {
      ...imported,
      plannedMigrationCreates: run.created ? 1 : 0,
      actualMigrationWrites: (run.created ? 1 : 0) + imported.actualMigrationWrites,
    };
    deps.writeSummary(formatExecutionSummary({
      target: "emulator",
      projectId: request.project,
      databaseId: run.databaseId,
      identity: "unverified emulator admin",
      runId: run.runId,
      mode: "initial",
      actor: run.actor,
      gitSha: run.gitSha ?? gitSha,
      workbookSha256: run.workbookSha256,
      plannedContentWrites: publicReport.plannedContentWrites,
      plannedAuditWrites: publicReport.plannedAuditWrites,
      plannedMigrationCreates: publicReport.plannedMigrationCreates,
      baseBudget: BASE_IMPORT_BUDGET,
      remainingObjectGroups: publicReport.plannedAuditWrites,
      authUsers,
      business,
    }));
    deps.writeReport(publicReport);
    return { publicReport, lockToken: run.lockToken, runId: run.runId, importedAt: run.importedAt, plan: planned };
  }
  const budget = await resumeBudget(db, request, actor);
  deps.writeSummary(formatExecutionSummary({
    ...summaryBase,
    actor: budget.actor,
    workbookSha256: budget.workbookSha256,
    plannedContentWrites: budget.plannedContentWrites,
    plannedAuditWrites: budget.plannedAuditWrites,
    plannedMigrationCreates: 0,
    remainingObjectGroups: budget.remainingObjectGroups,
  }));
  const run = await beginRun(db, {
    runId: budget.runId,
    workbookSha256: budget.workbookSha256,
    actor: budget.actor,
    gitSha,
  });
  const imported = await executeImport(db, budget.plans, {
    runId: run.runId,
    importedAt: run.importedAt,
    actor: run.actor,
    lockToken: run.lockToken,
  });
  const publicReport = { ...imported, plannedMigrationCreates: 0 };
  deps.writeReport(publicReport);
  return { publicReport, lockToken: run.lockToken, runId: run.runId, importedAt: run.importedAt };
}

export async function runImportEntry(request, deps) {
  const bound = withDefaults(deps);
  assertExecutionTarget({
    target: request.target,
    projectId: request.project,
    confirm: request.confirm,
    emulatorHost: bound.emulatorHost,
    execute: request.execute,
    databaseId: request.databaseId ?? "(default)",
  });
  if (request.target === "production") {
    const prepared = await prepareProduction(request, bound);
    if (!request.execute) {
      bound.writeReport(prepared.publicReport);
      return prepared;
    }
    assertProductionConnectionDisabled();
  }
  return runEmulator(request, bound);
}
