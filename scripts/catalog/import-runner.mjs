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
  readOnlyClassification,
  loadPlans,
  planSummary,
  preflightInitial,
  previewImport,
  projectIdOf,
  recoverImportLock,
  rollbackImport,
  tokenFingerprint,
} from "./import-core.mjs";
import {
  ALLOWED_PRODUCTION_SERVICE_ACCOUNTS,
  EXPECTED_DATABASE_ID,
  PRODUCTION_PROJECT_ID,
  assertBusinessCountsForProduction,
  assertExecutionTarget,
  assertExplicitConfirmation,
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
    afterGrant: deps.afterGrant,
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
  const production = projectIdOf(db) === PRODUCTION_PROJECT_ID;
  const preview = await previewImport(db, loaded.plans, {
    runId: record.runId,
    importedAt: record.importedAt,
    actor: record.actor,
    operator: production ? record.operator : (record.operator ?? record.actor),
    serviceAccount: production ? record.serviceAccount : (record.serviceAccount ?? "emulator"),
  });
  return {
    ...preview,
    plans: loaded.plans,
    workbookSha256: loaded.workbookSha256,
    runId: record.runId,
    importedAt: record.importedAt,
    actor: record.actor,
    operator: production ? record.operator : (record.operator ?? record.actor),
    serviceAccount: production ? record.serviceAccount : (record.serviceAccount ?? "emulator"),
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

function recoveryWriteSplit(recoveredWrites) {
  if (recoveredWrites !== 3) {
    return { recoveryLockWrites: 0, recoveryMigrationWrites: 0, recoveryAuditWrites: 0, recoveryControlWrites: 0 };
  }
  return { recoveryLockWrites: 1, recoveryMigrationWrites: 1, recoveryAuditWrites: 1, recoveryControlWrites: 3 };
}

async function rollbackPreflight(request, deps, db, identity) {
  if (identity.projectId !== PRODUCTION_PROJECT_ID || projectIdOf(db) !== PRODUCTION_PROJECT_ID) {
    throw new Error("refusing to run: credential project does not match the target project");
  }
  if (databaseIdOf(db) !== EXPECTED_DATABASE_ID) {
    throw new Error("refusing to run: database id must be (default)");
  }
  const migrationSnap = await db.doc(`artifacts/skatingx-production/trainingCatalogMigrations/${request.runId}`).get();
  if (!migrationSnap.exists) throw new Error(`migration ${request.runId} does not exist`);
  const record = migrationSnap.data();
  if (record.runId !== request.runId) {
    throw new Error(`rollback refused: migration runId is ${String(record.runId)}`);
  }
  if (record.status === "rolled_back") throw new Error(`rollback refused: run ${request.runId} is rolled_back`);
  if (record.projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error("rollback refused: projectId expected skatingx-prod");
  }
  if (record.databaseId !== EXPECTED_DATABASE_ID) {
    throw new Error("rollback refused: databaseId expected (default)");
  }
  if (typeof record.importedAt !== "string") throw new Error("rollback refused: stored importedAt is missing");
  const plan = buildImportPlan(record.importedAt, request.runId);
  if (record.workbookSha256 !== EXPECTED_WORKBOOK_SHA256 || plan.workbookSha256 !== EXPECTED_WORKBOOK_SHA256) {
    throw new Error(`rollback refused: workbookSha256 expected ${EXPECTED_WORKBOOK_SHA256}`);
  }
  if (!record.planSummary || record.planSummary.digest !== plan.planSummary.digest) {
    throw new Error("rollback refused: plan summary does not match the stored run");
  }
  const lockSnap = await db.doc(importLockPath()).get();
  if (!lockSnap.exists) throw new Error(`rollback refused: lock is not held by ${request.runId}`);
  const lock = lockSnap.data();
  if (lock.runId !== request.runId) throw new Error(`rollback refused: lock belongs to ${lock.runId}`);
  if (lock.purpose !== "import" && lock.purpose !== "rollback") {
    throw new Error("rollback refused: lock purpose is not recognized");
  }
  if (lock.status !== "held" && lock.status !== "released" && lock.status !== "failed" && lock.status !== "recovered") {
    throw new Error(`rollback refused: lock is ${lock.status}`);
  }
  if (request.recoverLock === true) {
    if (lock.status !== "held") throw new Error("lock recovery refused: there is no active holder");
    if (lock.purpose === "rollback" && record.status !== "rolling_back") {
      throw new Error("lock recovery refused: migration stage does not match the lock");
    }
  }
  if (!lockSnap.updateTime || typeof lockSnap.updateTime.isEqual !== "function" || typeof lock.token !== "string" || lock.token === "") {
    throw new Error("rollback refused: confirmed lock version is missing");
  }
  const inspected = await inspectCatalog(db);
  const collectionResults = Object.fromEntries(CATALOG_COLLECTIONS.map((name) => [name, (inspected.collectionDocs.get(name) ?? []).length]));
  if (typeof deps.countAuthUsers !== "function") {
    throw new Error("refusing to run: Firebase Auth user count is unavailable");
  }
  const authUsers = await deps.countAuthUsers();
  const business = await deps.countBusiness(db);
  const counted = assertBusinessCountsForProduction(authUsers, business);
  return {
    plan,
    identity,
    route: "rollback",
    confirmedTokenFingerprint: tokenFingerprint(lock.token),
    confirmedLockUpdateTime: lockSnap.updateTime,
    confirmedPurpose: lock.purpose,
    confirmedHolder: lock.actor,
    publicReport: {
      phase: "preflight",
      target: "production",
      route: request.recoverLock === true ? "recover" : "rollback",
      projectId: request.project,
      runId: request.runId,
      mode: request.mode,
      writes: 0,
      planDigest: plan.planSummary.digest,
      baseBudget: plan.baseBudget,
      parents: plan.parentPaths.length,
      versions: plan.versionPaths.length,
      identity: identity.clientEmail,
      operator: actorOfRequest(request),
      migrationStatus: record.status ?? "present",
      lockStatus: lock.status,
      lockPurpose: lock.purpose,
      orphans: inspected.orphans,
      collections: collectionResults,
      plannedContentWrites: 0,
      plannedAuditWrites: 0,
      gitSha: deps.gitSha(),
      workbookSha256: plan.workbookSha256,
      databaseId: databaseIdOf(db),
      authUsers: counted.authUsers,
      firestoreUsers: counted.firestoreUsers,
      raceResults: counted.raceResults,
      videoMetadata: counted.videoMetadata,
      raceVideos: counted.raceVideos ?? 0,
    },
  };
}

async function productionPreflight(request, deps, db, identity) {
  assertOpenedProductionRead(db);
  if (CATALOG_COLLECTIONS.length !== 11) throw new Error("refusing to run: catalog collection list is incomplete");
  if (request.rollback === true || request.recoverLock === true) {
    return rollbackPreflight(request, deps, db, identity);
  }
  let plan = buildImportPlan(deps.now().toISOString(), request.runId);
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
  const lockSnap = await db.doc(importLockPath()).get();
  const lock = lockSnap.exists ? lockSnap.data() : null;
  if (request.mode === "initial" && (lock?.status === "held" || inspected.orphans.length > 0)) {
    throw new Error(lock?.status === "held"
      ? `initial refused: import lock is held by ${lock.runId}`
      : `initial refused: orphan catalog path ${inspected.orphans[0]}`);
  }
  if (request.mode === "initial" && migration.exists) {
    throw new Error(`initial refused: migration ${request.runId} already exists`);
  }
  if (request.mode === "resume" && !migration.exists) throw new Error(`migration ${request.runId} does not exist`);
  if (request.mode === "resume" && migration.exists && typeof migration.data().importedAt === "string") {
    plan = buildImportPlan(migration.data().importedAt, request.runId);
  }
  if (request.mode === "resume" && inspected.orphans.length > 0) {
    throw new Error(`resume refused: orphan catalog path ${inspected.orphans[0]}`);
  }
  let classification = null;
  if (request.mode === "resume" && migration.exists) {
    const stored = migration.data();
    classification = await readOnlyClassification(db, plan.plans, {
      runId: request.runId,
      importedAt: stored.importedAt,
      actor: stored.actor,
      operator: stored.operator,
      serviceAccount: stored.serviceAccount,
    });
    if (classification.mismatched.length > 0 || classification.incomplete.length > 0) {
      throw new Error(`resume refused: ${[...classification.mismatched, ...classification.incomplete].join("; ")}`);
    }
  }
  const collectionResults = Object.fromEntries(CATALOG_COLLECTIONS.map((name) => [name, (inspected.collectionDocs.get(name) ?? []).length]));
  if (typeof deps.countAuthUsers !== "function") {
    throw new Error("refusing to run: Firebase Auth user count is unavailable");
  }
  const authUsers = await deps.countAuthUsers();
  const business = await deps.countBusiness(db);
  const counted = assertBusinessCountsForProduction(authUsers, business);
  return {
    plan,
    identity,
    confirmedTokenFingerprint: lockSnap.exists ? tokenFingerprint(String(lock?.token ?? "")) : "",
    confirmedLockUpdateTime: lockSnap.updateTime ?? null,
    confirmedPurpose: lock?.purpose ?? "",
    confirmedHolder: lock?.actor ?? "",
    publicReport: {
      phase: "preflight",
      target: "production",
      projectId: request.project,
      runId: request.runId,
      mode: request.mode,
      writes: 0,
      planDigest: plan.planSummary.digest,
      baseBudget: plan.baseBudget,
      parents: plan.parentPaths.length,
      versions: plan.versionPaths.length,
      identity: identity.clientEmail,
      operator: actorOfRequest(request),
      migrationStatus: migration.exists ? migration.data().status ?? "present" : "absent",
      lockStatus: lock?.status ?? "absent",
      orphans: inspected.orphans,
      collections: collectionResults,
      plannedContentWrites: classification ? classification.plannedContentWrites : plan.parentPaths.length * 2,
      plannedAuditWrites: classification ? classification.plannedAuditWrites : plan.parentPaths.length,
      gitSha: deps.gitSha(),
      workbookSha256: plan.workbookSha256,
      databaseId: databaseIdOf(db),
      authUsers: counted.authUsers,
      firestoreUsers: counted.firestoreUsers,
      raceResults: counted.raceResults,
      videoMetadata: counted.videoMetadata,
      raceVideos: counted.raceVideos ?? 0,
    },
  };
}

async function runEmulator(request, deps, labels = {}) {
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
    target: labels.target ?? "emulator",
    projectId: request.project,
    databaseId: databaseIdOf(db),
    identity: labels.identity ?? "unverified emulator admin",
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
      if (request.recoverLock !== true && (budget.mismatched.length > 0 || budget.incomplete.length > 0)) {
        throw new Error(`resume refused: ${[...budget.mismatched, ...budget.incomplete].join("; ")}`);
      }
    }
    const publicReport = {
      phase: "preflight",
      projectId: request.project,
      runId: request.runId,
      mode: request.mode,
      actualContentWrites: 0,
      actualAuditWrites: 0,
      migrationDocumentWrites: 0,
      lockDocumentWrites: 0,
    };
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
    if (request.stopAfterLock === true) {
      const heldReport = {
        phase: "lock-held",
        projectId: request.project,
        runId: run.runId,
        mode: request.mode,
      };
      deps.writeReport(heldReport);
      return { publicReport: heldReport, lockToken: run.lockToken, runId: run.runId, importedAt: run.importedAt };
    }
    const planned = buildImportPlan(run.importedAt, run.runId);
    const imported = await executeImport(db, planned.plans, {
      runId: run.runId,
      importedAt: run.importedAt,
      actor: run.actor,
      operator: run.operator ?? run.actor,
      serviceAccount: run.serviceAccount ?? "emulator",
      lockToken: run.lockToken,
    });
    const publicReport = {
      ...imported,
      plannedMigrationCreates: run.created ? 1 : 0,
      actualMigrationWrites: (run.created ? 1 : 0) + (imported.migrationDocumentWrites ?? 0),
      migrationDocumentWrites: (run.created ? 1 : 0) + (imported.migrationDocumentWrites ?? 0),
      lockDocumentWrites: (run.created ? 1 : 0) + (imported.lockDocumentWrites ?? 0),
      totalWrites:
        imported.actualContentWrites +
        imported.actualAuditWrites +
        (run.created ? 2 : (run.lockWrites ?? 0)) +
        (imported.controlWrites ?? 0),
    };
    deps.writeSummary(formatExecutionSummary({
      ...summaryBase,
      databaseId: run.databaseId,
      runId: run.runId,
      actor: run.actor,
      gitSha: run.gitSha ?? gitSha,
      workbookSha256: run.workbookSha256,
      plannedContentWrites: publicReport.plannedContentWrites,
      plannedAuditWrites: publicReport.plannedAuditWrites,
      plannedMigrationCreates: publicReport.plannedMigrationCreates,
      remainingObjectGroups: publicReport.plannedAuditWrites,
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
  if (request.recoverLock !== true && (budget.mismatched.length > 0 || budget.incomplete.length > 0)) {
    throw new Error(`resume refused: ${[...budget.mismatched, ...budget.incomplete].join("; ")}`);
  }
  let lockToken;
  let recoveredWrites = 0;
  if (request.recoverLock === true) {
    const lockSnap = await db.doc(importLockPath()).get();
    if (!lockSnap.exists) throw new Error("lock recovery refused: import lock does not exist");
    const confirmedTokenFingerprint = labels.confirmedTokenFingerprint
      ?? tokenFingerprint(String(lockSnap.data()?.token ?? ""));
    const confirmedLockUpdateTime = labels.confirmedLockUpdateTime ?? lockSnap.updateTime;
    const confirmedPurpose = labels.confirmedPurpose ?? lockSnap.data()?.purpose;
    const confirmedHolder = labels.confirmedHolder ?? lockSnap.data()?.actor;
    if (labels.alreadyConfirmed !== true) {
      if (typeof deps.confirmProject !== "function") {
        throw new Error("refusing to run: stdin confirmation is not configured");
      }
      assertExplicitConfirmation(await deps.confirmProject(request.project), request.project);
    }
    const recovered = await recoverImportLock(db, {
      runId: budget.runId,
      actor: budget.actor,
      confirmHolderDead: true,
      reason: request.recoverReason,
      confirmedTokenFingerprint,
      confirmedLockUpdateTime,
      confirmedPurpose,
      confirmedHolder,
    });
    lockToken = recovered.lockToken;
    recoveredWrites = 3;
    if (recovered.purpose === "rollback" || request.stopAfterRecover === true) {
      const split = recoveryWriteSplit(recoveredWrites);
      const publicReport = {
        phase: "recovered",
        projectId: request.project,
        runId: request.runId,
        mode: request.mode,
        purpose: recovered.purpose,
        migrationStatus: recovered.migrationStatus,
        lockStatus: recovered.lockStatus,
        ...split,
      };
      deps.writeReport(publicReport);
      return { publicReport, lockToken: recovered.lockToken, runId: request.runId };
    }
  }
  const run = await beginRun(db, {
    runId: budget.runId,
    workbookSha256: budget.workbookSha256,
    actor: budget.actor,
    gitSha,
    lockToken,
    serviceAccount: budget.serviceAccount,
  });
  if (request.stopAfterLock === true) {
    const heldReport = {
      phase: "lock-held",
      projectId: request.project,
      runId: run.runId,
      mode: request.mode,
    };
    deps.writeReport(heldReport);
    return { publicReport: heldReport, lockToken: run.lockToken, runId: run.runId, importedAt: run.importedAt };
  }
  const imported = await executeImport(db, budget.plans, {
    runId: run.runId,
    importedAt: run.importedAt,
    actor: run.actor,
    operator: run.operator ?? run.actor,
    serviceAccount: run.serviceAccount ?? budget.serviceAccount ?? "emulator",
    lockToken: run.lockToken,
  });
  const split = recoveryWriteSplit(recoveredWrites);
  const publicReport = {
    ...imported,
    plannedMigrationCreates: 0,
    actualMigrationWrites: (imported.migrationDocumentWrites ?? 0) + split.recoveryMigrationWrites,
    migrationDocumentWrites: (imported.migrationDocumentWrites ?? 0) + split.recoveryMigrationWrites,
    lockDocumentWrites: (run.lockWrites ?? 0) + (imported.lockDocumentWrites ?? 0) + split.recoveryLockWrites,
    recoveryAuditWrites: split.recoveryAuditWrites,
    recoveryControlWrites: split.recoveryControlWrites,
    totalWrites: imported.actualContentWrites
      + imported.actualAuditWrites
      + split.recoveryAuditWrites
      + (run.lockWrites ?? 0)
      + split.recoveryLockWrites
      + (imported.controlWrites ?? 0)
      + split.recoveryMigrationWrites,
  };
  deps.writeReport(publicReport);
  return { publicReport, lockToken: run.lockToken, runId: run.runId, importedAt: run.importedAt };
}

async function runRollback(request, deps, db, options = {}) {
  if (options.alreadyConfirmed !== true) {
    if (typeof deps.confirmProject !== "function") {
      throw new Error("refusing to run: stdin confirmation is not configured");
    }
    assertExplicitConfirmation(await deps.confirmProject(request.project), request.project);
  }
  const result = await rollbackImport(db, request.runId, {
    memoryToken: rollbackTokens.get(request.runId) ?? "",
    crashAfterLock: request.crashAfterLock === true,
    crashAfterSnapshots: request.crashAfterSnapshots,
    crashAfterParents: request.crashAfterParents,
    crashBeforeMark: request.crashBeforeMark === true,
    crashAfterMark: request.crashAfterMark === true,
    crashAfterCommit: request.crashAfterCommit === true,
    confirmedTokenFingerprint: options.confirmedTokenFingerprint,
    confirmedLockUpdateTime: options.confirmedLockUpdateTime,
    confirmedPurpose: options.confirmedPurpose,
    confirmedHolder: options.confirmedHolder,
    onLockToken: (token) => {
      rollbackTokens.set(request.runId, token);
    },
  });
  if (typeof result.lockToken === "string" && result.lockToken !== "") {
    rollbackTokens.set(request.runId, result.lockToken);
  }
  return result;
}

function rollbackReport(result, target) {
  const counts = result.rollbackResult ?? {};
  return {
    phase: "rollback",
    target,
    status: result.status,
    deletedParents: counts.deletedParents ?? 0,
    deletedSnapshots: counts.deletedSnapshots ?? 0,
    retainedAudits: counts.retainedAudits ?? 0,
    controlWrites: counts.controlWrites ?? 0,
    controlUpdates: counts.controlUpdates ?? 0,
    totalOperations: counts.totalOperations ?? counts.controlWrites ?? 0,
  };
}

const rollbackTokens = new Map();
let productionWriter = "";

export async function runImportEntry(request, deps) {
  if (request.target === "production" && (
    request.crashAfterLock === true
    || request.stopAfterLock === true
    || request.stopAfterRecover === true
    || request.crashAfterSnapshots !== undefined
    || request.crashAfterParents !== undefined
    || request.crashBeforeMark === true
    || request.crashAfterMark === true
    || request.crashAfterCommit === true
  )) {
    throw new Error("refusing to run: test limits are not available for production");
  }
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
    if (typeof bound.openFirestore !== "function") {
      throw new Error("refusing to run: production connection is not configured");
    }
    const owner = writing ? `${request.runId}:${Date.now()}:${Math.random()}` : "";
    if (writing && productionWriter !== "") {
      throw new Error("refusing to run: a production import is already active in this process");
    }
    if (writing) productionWriter = owner;
    let db;
    try {
      db = await bound.openFirestore(request.project);
      const prepared = await productionPreflight(request, bound, db, identity);
      const pendingContent = prepared.publicReport.plannedContentWrites;
      const pendingAudits = prepared.publicReport.plannedAuditWrites;
      bound.writeSummary(formatExecutionSummary({
        target: "production",
        projectId: request.project,
        databaseId: databaseIdOf(db),
        identity: identity.clientEmail,
        runId: request.runId,
        mode: request.mode,
        actor: actorOfRequest(request),
        gitSha: bound.gitSha(),
        workbookSha256: prepared.plan.workbookSha256,
        plannedContentWrites: pendingContent,
        plannedAuditWrites: pendingAudits,
        plannedMigrationCreates: request.mode === "initial" ? 1 : 0,
        baseBudget: prepared.plan.baseBudget,
        planDigest: prepared.plan.planSummary.digest,
        remainingObjectGroups: pendingAudits,
        collections: prepared.publicReport.collections,
        lockStatus: prepared.publicReport.lockStatus,
        orphans: prepared.publicReport.orphans,
        migrationStatus: prepared.publicReport.migrationStatus,
        authUsers: { status: "available", count: prepared.publicReport.authUsers },
        business: {
          status: "available",
          firestoreUsers: prepared.publicReport.firestoreUsers,
          raceResults: prepared.publicReport.raceResults,
          videoMetadata: prepared.publicReport.videoMetadata,
          raceVideos: prepared.publicReport.raceVideos,
        },
      }));
      if (!writing) {
        bound.writeReport(prepared.publicReport);
        return prepared;
      }
      if (typeof bound.confirmProject !== "function") {
        throw new Error("refusing to run: stdin confirmation is not configured");
      }
      assertExplicitConfirmation(await bound.confirmProject(request.project), request.project);
      grantProductionWrite(identity);
      if (typeof bound.afterGrant === "function") await bound.afterGrant();
      if (request.rollback === true) {
        const result = await runRollback(request, bound, db, {
          alreadyConfirmed: true,
          confirmedTokenFingerprint: prepared.confirmedTokenFingerprint,
          confirmedLockUpdateTime: prepared.confirmedLockUpdateTime,
          confirmedPurpose: prepared.confirmedPurpose,
          confirmedHolder: prepared.confirmedHolder,
        });
        const publicReport = rollbackReport(result, "production");
        bound.writeReport(publicReport);
        return { publicReport };
      }
      return await runEmulator(request, {
        ...bound,
        openFirestore: async () => db,
      }, {
        target: "production",
        identity: identity.clientEmail,
        alreadyConfirmed: true,
        confirmedTokenFingerprint: prepared.confirmedTokenFingerprint,
        confirmedLockUpdateTime: prepared.confirmedLockUpdateTime,
        confirmedPurpose: prepared.confirmedPurpose,
        confirmedHolder: prepared.confirmedHolder,
      });
    } finally {
      if (owner !== "" && productionWriter === owner) {
        productionWriter = "";
        clearProductionWriteGrant();
      }
    }
  }
  if (request.rollback === true) {
    if (typeof bound.openFirestore !== "function") {
      throw new Error("refusing to run: emulator connection is not configured");
    }
    const db = await bound.openFirestore(request.project);
    const result = await runRollback(request, bound, db);
    const publicReport = rollbackReport(result, "emulator");
    bound.writeReport(publicReport);
    return { publicReport };
  }
  return runEmulator(request, bound);
}
