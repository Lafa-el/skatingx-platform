// Shared catalog import orchestration.
//
// The read switch opens a read-only production preflight. The write switch is
// a second gate and still requires a verified service account, --confirm, and
// stdin. Injected dependencies cannot grant that identity by themselves.
import {
  BASE_IMPORT_BUDGET,
  CATALOG_COLLECTIONS,
  EXPECTED_WORKBOOK_SHA256,
  IMPORT_ACTOR,
  assertResumeCatalog,
  assertResumeIdentity,
  auditDocId,
  beginRun,
  clearProductionWriteGrant,
  databaseIdOf,
  executeImport,
  grantProductionWrite,
  importLockPath,
  inspectCatalog,
  loadPlans,
  planSummary,
  preflightInitial,
  previewImport,
  projectIdOf,
  recoverImportLock,
  rollbackImport,
} from "./import-core.mjs";
import {
  ALLOWED_PRODUCTION_SERVICE_ACCOUNTS,
  EXPECTED_DATABASE_ID,
  PRODUCTION_PROJECT_ID,
  assertBusinessCountsForProduction,
  assertExecutionTarget,
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
    countAuthUsers: deps.countAuthUsers,
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

async function verifiedProductionIdentity(request, deps) {
  const described = await deps.credentialProvider.describe();
  const identityInput = {
    credential: credentialView(described),
    projectId: request.project,
  };
  if (deps.allowedEmails !== undefined) identityInput.allowedEmails = deps.allowedEmails;
  else identityInput.allowedEmails = ALLOWED_PRODUCTION_SERVICE_ACCOUNTS;
  const identity = assertServiceAccountIdentity(identityInput);
  return { type: identity.type, clientEmail: identity.clientEmail, projectId: identity.projectId };
}

function assertOpenedProductionRead(db) {
  if (projectIdOf(db) !== PRODUCTION_PROJECT_ID) {
    throw new Error("refusing to read: production mode requires project id skatingx-prod");
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("refusing production read while FIRESTORE_EMULATOR_HOST is set");
  }
  if (databaseIdOf(db) !== EXPECTED_DATABASE_ID) {
    throw new Error("refusing to read: database id must be (default)");
  }
}

async function productionPreflight(request, deps, db, identity) {
  assertOpenedProductionRead(db);
  if (CATALOG_COLLECTIONS.length !== 11) throw new Error("refusing to run: catalog collection list is incomplete");
  const plan = buildImportPlan(deps.now().toISOString(), request.runId);
  const inspected = await inspectCatalog(db);
  for (const name of CATALOG_COLLECTIONS) {
    const paths = inspected.collectionDocs.get(name);
    if (!paths) throw new Error(`refusing to run: catalog collection ${name} was not read`);
    const content = paths.filter((docPath) => docPath !== importLockPath());
    if (request.mode === "initial" && content.length > 0) {
      throw new Error(`initial refused: ${name} is not empty (${content[0]})`);
    }
  }
  const migration = await db.doc(plan.migrationPath).get();
  if (request.mode === "initial" && migration.exists) {
    throw new Error(`initial refused: migration ${request.runId} already exists`);
  }
  if (request.mode === "resume" && !migration.exists) throw new Error(`migration ${request.runId} does not exist`);
  if (typeof deps.countAuthUsers !== "function") {
    throw new Error("refusing to run: Firebase Auth user count is unavailable");
  }
  const authUsers = await deps.countAuthUsers();
  const business = await deps.countBusiness(db);
  const counted = assertBusinessCountsForProduction(authUsers, business);
  return {
    plan,
    identity,
    publicReport: {
      phase: "preflight",
      target: "production",
      writes: 0,
      planDigest: plan.planSummary.digest,
      baseBudget: plan.baseBudget,
      parents: plan.parentPaths.length,
      versions: plan.versionPaths.length,
      identity: identity.clientEmail,
      operator: actorOfRequest(request),
      migrationStatus: migration.exists ? migration.data().status ?? "present" : "absent",
      authUsers: counted.authUsers,
      firestoreUsers: counted.firestoreUsers,
      raceResults: counted.raceResults,
      videoMetadata: counted.videoMetadata,
    },
  };
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
      operator: run.operator ?? run.actor,
      serviceAccount: run.serviceAccount ?? "emulator",
      lockToken: run.lockToken,
    });
    const contentBatches = Array.isArray(imported.batches) ? imported.batches.length : 0;
    const progressWrites = imported.actualMigrationWrites;
    const publicReport = {
      ...imported,
      plannedMigrationCreates: run.created ? 1 : 0,
      actualMigrationWrites: (run.created ? 1 : 0) + imported.actualMigrationWrites,
      totalWrites:
        imported.actualContentWrites +
        imported.actualAuditWrites +
        (run.created ? 1 : 0) +
        progressWrites +
        (run.created ? 1 : 0) +
        1 +
        contentBatches +
        progressWrites,
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
  let lockToken;
  if (request.recoverLock === true) {
    if (typeof deps.confirmProject !== "function") {
      throw new Error("refusing to run: stdin confirmation is not configured");
    }
    await deps.confirmProject(request.project);
    const recovered = await recoverImportLock(db, {
      runId: budget.runId,
      actor: budget.actor,
      confirmHolderDead: true,
      reason: request.recoverReason,
    });
    lockToken = recovered.lockToken;
  }
  const run = await beginRun(db, {
    runId: budget.runId,
    workbookSha256: budget.workbookSha256,
    actor: budget.actor,
    gitSha,
    lockToken,
    serviceAccount: budget.serviceAccount,
  });
  const imported = await executeImport(db, budget.plans, {
    runId: run.runId,
    importedAt: run.importedAt,
    actor: run.actor,
    operator: run.operator ?? run.actor,
    serviceAccount: run.serviceAccount ?? budget.serviceAccount ?? "emulator",
    lockToken: run.lockToken,
  });
  const publicReport = { ...imported, plannedMigrationCreates: 0 };
  deps.writeReport(publicReport);
  return { publicReport, lockToken: run.lockToken, runId: run.runId, importedAt: run.importedAt };
}

async function runRollback(request, deps, db) {
  if (typeof deps.confirmProject !== "function") {
    throw new Error("refusing to run: stdin confirmation is not configured");
  }
  await deps.confirmProject(request.project);
  const lock = await db.doc(importLockPath()).get();
  if (!lock.exists || lock.data().runId !== request.runId) {
    throw new Error(`rollback refused: lock is not held by ${request.runId}`);
  }
  return rollbackImport(db, request.runId, { lockToken: lock.data().token });
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
    const writing = request.execute === true || request.rollback === true || request.recoverLock === true;
    if (writing && request.allowProductionWrite !== true) {
      if (request.execute === true || request.rollback === true || request.recoverLock === true) {
        await verifiedProductionIdentity(request, bound);
        if (typeof bound.confirmProject === "function") await bound.confirmProject(request.project);
      }
      throw new Error("refusing to run: production write is disabled");
    }
    if (!writing && request.allowProductionRead !== true) {
      throw new Error("refusing to run: production read is disabled");
    }
    const identity = await verifiedProductionIdentity(request, bound);
    if (writing) {
      if (typeof bound.confirmProject !== "function") {
        throw new Error("refusing to run: stdin confirmation is not configured");
      }
      await bound.confirmProject(request.project);
      grantProductionWrite(identity);
    }
    if (typeof bound.openFirestore !== "function") {
      throw new Error("refusing to run: production connection is not configured");
    }
    const db = await bound.openFirestore(request.project);
    try {
      if (!writing) {
        const prepared = await productionPreflight(request, bound, db, identity);
        bound.writeReport(prepared.publicReport);
        return prepared;
      }
      await productionPreflight(request, bound, db, identity);
      if (request.rollback === true) {
        const result = await runRollback(request, bound, db);
        const publicReport = { phase: "rollback", writes: 0, status: result.status };
        bound.writeReport(publicReport);
        return { publicReport };
      }
      return runEmulator({ ...request, target: "emulator", project: request.project }, {
        ...bound,
        emulatorHost: "production-granted",
        openFirestore: async () => db,
      });
    } finally {
      clearProductionWriteGrant();
    }
  }
  if (request.rollback === true) {
    if (typeof bound.openFirestore !== "function") {
      throw new Error("refusing to run: emulator connection is not configured");
    }
    const db = await bound.openFirestore(request.project);
    const result = await runRollback(request, bound, db);
    const publicReport = { phase: "rollback", status: result.status };
    bound.writeReport(publicReport);
    return { publicReport };
  }
  return runEmulator(request, bound);
}
