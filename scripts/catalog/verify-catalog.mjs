// Catalog import acceptance. Reads and judgments stay separate. Nothing here writes.
import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  canonicalCatalogJson,
  contentChecksumPayload,
  findCatalogCycles,
} from "../../packages/training-catalog/src/index.ts";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum.ts";
import {
  BASE_IMPORT_BUDGET,
  CONTENT_VERSION,
  EXPECTED_WORKBOOK_SHA256,
  auditDocId,
  databaseIdOf,
  documentData,
  inspectCatalog,
  loadPlans,
  importLockPath,
  planSummary,
  projectIdOf,
  readPlannedDocs,
} from "./import-core.mjs";
import { compareBusiness } from "./backup-prod.mjs";

const ROOT = "artifacts/skatingx-production";
const OBJECTS = "trainingCatalogObjects";
const AUDIT = "trainingCatalogAuditLogs";
const MIGRATIONS = "trainingCatalogMigrations";
const EXPECTED_KINDS = { exercise: 120, drill: 68, block: 51, session: 18 };
const CONDITIONAL_IDS = ["EX-L039", "EX-L078", "EX-L079", "EX-L080"];
const CONDITIONAL_SAFETY = {
  youthDefault: "Conditional",
  supervision: "Qualified adult/coach",
  safetyFlag: "review_required",
};
const FORBIDDEN = ["sourceLegacyId", "supersedesVersion", "publishedVersion", "reviewer", "reviewedAt", "source", "exerciseRefsSource"];

function check(name, passed, detail, paths = []) {
  return { name, status: passed ? "pass" : "fail", passed: Boolean(passed), detail, paths };
}

const IDEMPOTENCY_SKIPPED = "幂等由独立的集成测试入口验证，不由本次只读验收验证";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checksumInput(data) {
  const input = {
    localeContent: data.localeContent,
    taxonomy: data.taxonomy,
    refs: data.refs,
    legacyAttributes: isRecord(data.legacyAttributes) ? data.legacyAttributes : {},
    schemaVersion: data.schemaVersion,
  };
  if (typeof data.supersedesVersion === "string") input.supersedesVersion = data.supersedesVersion;
  return input;
}

function checksumOf(data) {
  return computeCatalogChecksum(contentChecksumPayload(checksumInput(data)));
}

function payloadJson(data) {
  return canonicalCatalogJson(contentChecksumPayload(checksumInput(data)));
}

function storedMap(stored) {
  return new Map(stored.map((item) => [item.path, item.data]));
}

export async function readCatalogVerification(db, runId, mode = "emulator") {
  const migrationSnap = await db.doc(`${ROOT}/${MIGRATIONS}/${runId}`).get();
  const migration = migrationSnap.exists ? migrationSnap.data() : null;
  const inspected = await inspectCatalog(db);
  const plans = migration?.importedAt ? loadPlans(migration.importedAt).plans : [];
  const storedDocs = plans.length === 0 ? new Map() : await readPlannedDocs(db, plans, mode);
  const auditPaths = inspected.collectionDocs.get(AUDIT) ?? [];
  const auditDocs = auditPaths.length === 0 ? new Map() : await readPlannedDocs(db, auditPaths.map((docPath) => ({ path: docPath })), mode);
  return {
    projectId: projectIdOf(db),
    databaseId: databaseIdOf(db),
    migration,
    plans,
    stored: [...storedDocs.entries()].map(([docPath, data]) => ({ path: docPath, data })),
    inspected: {
      collectionDocs: Object.fromEntries([...inspected.collectionDocs.entries()]),
      orphans: [...inspected.orphans],
      versionPaths: [...inspected.versionPaths],
    },
    audits: [...auditDocs.entries()].map(([docPath, data]) => ({ path: docPath, data })),
  };
}

export function evaluateCatalogImport(input) {
  const migration = input.migration ?? {};
  const runId = input.runId;
  const plans = input.plans ?? [];
  const docs = storedMap(input.stored ?? []);
  const parents = plans.filter((plan) => !plan.path.includes("/versions/"));
  const versions = plans.filter((plan) => plan.path.includes("/versions/"));
  const parentById = new Map();
  const checks = [];
  const conflicts = [];

  const digest = plans.length > 0 ? planSummary(plans).digest : "";
  const identityProblems = [];
  if (input.projectId !== migration.projectId) identityProblems.push("projectId");
  if (input.databaseId !== migration.databaseId) identityProblems.push("databaseId");
  if (migration.runId !== runId) identityProblems.push("runId");
  if (migration.workbookSha256 !== EXPECTED_WORKBOOK_SHA256 || input.workbookSha256 !== EXPECTED_WORKBOOK_SHA256) identityProblems.push("workbookSha256");
  if (migration.gitSha !== input.gitHead) identityProblems.push("gitHead");
  if (migration.planSummary?.digest !== digest) identityProblems.push("planSummary");
  checks.push(check("executionIdentity", identityProblems.length === 0, identityProblems.join(", ") || "matches the migration record"));
  checks.push(check("migrationStatus", migration.status === "completed", `status ${String(migration.status)}`, [`${ROOT}/${MIGRATIONS}/${runId}`]));

  const business = input.business ?? { countBefore: 0, countAfter: 0, changes: [] };
  checks.push(check(
    "businessUnchanged",
    business.changes.length === 0 && business.countBefore === business.countAfter,
    business.changes.length === 0 ? "business documents match the baseline" : "business documents changed; this does not by itself identify the catalog import as the cause",
    business.changes.map((item) => item.path),
  ));

  const allowedContent = new Set(plans.map((plan) => plan.path));
  const expectedAudits = new Set(parents.map((plan) => `${ROOT}/${AUDIT}/${auditDocId(runId, String(plan.data.id))}`));
  const allowed = new Set([...allowedContent, ...expectedAudits, `${ROOT}/${MIGRATIONS}/${runId}`]);
  const unknown = [...(input.inspected?.orphans ?? [])];
  for (const paths of Object.values(input.inspected?.collectionDocs ?? {})) {
    for (const docPath of paths) {
      if (docPath === importLockPath()) continue;
      if (!allowed.has(docPath)) unknown.push(docPath);
    }
  }
  for (const docPath of input.inspected?.versionPaths ?? []) if (!allowed.has(docPath)) unknown.push(docPath);
  const contentPaths = [
    ...(input.inspected?.collectionDocs?.[OBJECTS] ?? []),
    ...(input.inspected?.versionPaths ?? []),
  ];
  const contentOk = contentPaths.length === plans.length && contentPaths.every((docPath) => allowedContent.has(docPath)) && unknown.length === 0;
  checks.push(check("catalogPaths", contentOk && parents.length === 257 && versions.length === 257, contentOk ? "257 parents and 257 snapshots" : "catalog paths are not the planned set", unknown));
  checks.push(check("orphanVersions", (input.inspected?.orphans ?? []).length === 0, "orphan version scan", input.inspected?.orphans ?? []));

  const auditPaths = [];
  const auditProblems = [];
  const seenObjects = new Map();
  for (const audit of input.audits ?? []) {
    auditPaths.push(audit.path);
    const data = audit.data ?? {};
    const objectId = data.target?.id;
    if (data.runId === runId && data.result === "ok") {
      const count = (seenObjects.get(objectId) ?? 0) + 1;
      seenObjects.set(objectId, count);
      if (count > 1) auditProblems.push(audit.path);
    }
    if (!expectedAudits.has(audit.path)) auditProblems.push(audit.path);
    const parent = docs.get(`${ROOT}/${OBJECTS}/${objectId}`);
    if (data.action !== "import" || data.actor !== migration.actor || data.runId !== runId || data.result !== "ok") {
      auditProblems.push(audit.path);
    }
    if (data.target?.collection !== OBJECTS || data.target?.contentVersion !== CONTENT_VERSION) auditProblems.push(audit.path);
    if (!parent || data.checksum !== parent.checksum) {
      auditProblems.push(audit.path);
      conflicts.push({ path: audit.path, kind: "audit-checksum" });
    }
  }
  for (const docPath of expectedAudits) if (!auditPaths.includes(docPath)) auditProblems.push(docPath);
  const uniqueAuditProblems = [...new Set(auditProblems)];
  checks.push(check(
    "auditIntegrity",
    uniqueAuditProblems.length === 0 && seenObjects.size === 257 && auditPaths.length === 257,
    `audits ${auditPaths.length}`,
    uniqueAuditProblems,
  ));

  const kindCounts = { exercise: 0, drill: 0, block: 0, session: 0 };
  const countPaths = [];
  const checksumPaths = [];
  const draftPaths = [];
  const snapshotPaths = [];
  const fidelityPaths = [];
  for (const plan of parents) {
    const data = docs.get(plan.path);
    if (!data) {
      countPaths.push(plan.path);
      continue;
    }
    if (kindCounts[data.kind] !== undefined) kindCounts[data.kind] += 1;
    else countPaths.push(plan.path);
    parentById.set(String(plan.data.id), data);
    if (checksumOf(data) !== data.checksum) checksumPaths.push(plan.path);
    if (data.status !== "draft" || data.reviewStatus !== "pending" || Object.hasOwn(data, "publishedVersion")) draftPaths.push(plan.path);
    for (const key of FORBIDDEN) if (Object.hasOwn(data, key)) draftPaths.push(plan.path);
    try {
      if (canonicalCatalogJson(documentData(data)) !== canonicalCatalogJson(documentData(plan.data))) fidelityPaths.push(plan.path);
    } catch (error) {
      fidelityPaths.push(plan.path);
      conflicts.push({ path: plan.path, kind: "canonical", detail: error instanceof Error ? error.name : "error" });
    }
  }
  for (const plan of versions) {
    const data = docs.get(plan.path);
    const parentId = plan.path.slice(`${ROOT}/${OBJECTS}/`.length, plan.path.indexOf("/versions/"));
    const parent = parentById.get(parentId);
    if (!data || !parent || data.checksum !== parent.checksum || payloadJson(data) !== payloadJson(parent)) snapshotPaths.push(plan.path);
    if (data && (data.status !== "draft" || data.reviewStatus !== "pending" || Object.hasOwn(data, "publishedVersion"))) draftPaths.push(plan.path);
  }
  const kindsOk = Object.entries(EXPECTED_KINDS).every(([kind, count]) => kindCounts[kind] === count) && countPaths.length === 0;
  checks.push(check("counts", kindsOk, JSON.stringify(kindCounts), countPaths));
  checks.push(check("checksums", checksumPaths.length === 0, "parent checksums", checksumPaths));
  checks.push(check("snapshots", snapshotPaths.length === 0 && versions.length === 257, "snapshot checksum and canonical payload", snapshotPaths));
  checks.push(check("canonicalFidelity", fidelityPaths.length === 0, "stored documents match the frozen mapper", fidelityPaths));
  checks.push(check("draftReview", draftPaths.length === 0, "draft, pending, no publishedVersion", [...new Set(draftPaths)]));

  let blockToDrill = 0;
  let sessionToBlock = 0;
  let otherRefs = 0;
  const refPaths = [];
  const drillPaths = [];
  const nodes = [];
  for (const [id, data] of parentById) {
    if (!Array.isArray(data.refs)) {
      refPaths.push(`${ROOT}/${OBJECTS}/${id}`);
      continue;
    }
    nodes.push({ id, kind: data.kind, refs: data.refs });
    if (data.kind === "drill" && data.refs.length !== 0) drillPaths.push(`${ROOT}/${OBJECTS}/${id}`);
    for (const ref of data.refs) {
      if (data.kind === "block") blockToDrill += 1;
      else if (data.kind === "session") sessionToBlock += 1;
      else otherRefs += 1;
      if (!parentById.has(ref.id) || ref.contentVersion !== CONTENT_VERSION) refPaths.push(`${ROOT}/${OBJECTS}/${id}`);
    }
  }
  const cycles = nodes.length === 0 ? [] : findCatalogCycles(nodes);
  checks.push(check("refs", blockToDrill === 115 && sessionToBlock === 57 && otherRefs === 0 && refPaths.length === 0, `refs ${blockToDrill + sessionToBlock}`, refPaths));
  checks.push(check("cycles", cycles.length === 0, `cycles ${cycles.length}`));
  checks.push(check("drillsNoInferredRefs", drillPaths.length === 0 && kindCounts.drill === 68, "drill refs stay empty", drillPaths));
  const conditionalPaths = [];
  for (const id of CONDITIONAL_IDS) {
    const legacy = parentById.get(id)?.legacyAttributes;
    if (!isRecord(legacy) || legacy.youthDefault !== CONDITIONAL_SAFETY.youthDefault || legacy.supervision !== CONDITIONAL_SAFETY.supervision || legacy.safetyFlag !== CONDITIONAL_SAFETY.safetyFlag) {
      conditionalPaths.push(`${ROOT}/${OBJECTS}/${id}`);
    }
  }
  checks.push(check("conditionalSafety", conditionalPaths.length === 0, "four conditional exercises keep their safety fields", conditionalPaths));

  checks.push(check(
    "budgetSeparation",
    migration.status === "completed" && migration.progress?.completedObjects === 257 && migration.progress?.remainingObjects === 0,
    `baseBudget ${BASE_IMPORT_BUDGET}; migration status updates are outside that budget`,
    [`${ROOT}/${MIGRATIONS}/${runId}`],
  ));

  const idem = input.idempotency ?? {};
  const hasCounts = typeof idem.actualContentWrites === "number" && typeof idem.actualAuditWrites === "number";
  if (idem.skipped === true) {
    checks.push({ name: "idempotency", status: "skipped", passed: false, detail: IDEMPOTENCY_SKIPPED, paths: [] });
  } else if (hasCounts) {
    checks.push(check(
      "idempotency",
      idem.actualContentWrites === 0 && idem.actualAuditWrites === 0,
      `content ${idem.actualContentWrites} audits ${idem.actualAuditWrites}`,
    ));
  } else {
    checks.push(check("idempotency", false, "idempotency result is missing"));
  }

  const rules = input.rules ?? {};
  if (input.mode === "production") {
    checks.push(check("rulesAnonymous", rules.skipped === true, "client rules spot check stays on the emulator"));
    checks.push(check("rulesSignedIn", rules.skipped === true, "client rules spot check stays on the emulator"));
    checks.push(check("rulesAdmin", rules.skipped === true, "client rules spot check stays on the emulator"));
  } else {
    checks.push(check("rulesAnonymous", rules.anonymous === "denied", String(rules.anonymous ?? "missing")));
    checks.push(check("rulesSignedIn", rules.signedIn === "denied", String(rules.signedIn ?? "missing")));
    checks.push(check("rulesAdmin", rules.admin === "allowed", String(rules.admin ?? "missing")));
  }

  return {
    projectId: input.projectId,
    databaseId: input.databaseId,
    runId,
    gitHead: input.gitHead,
    workbookSha256: input.workbookSha256,
    counts: { parents: parentById.size, versions: versions.length - snapshotPaths.length, ...kindCounts, refs: blockToDrill + sessionToBlock, audits: auditPaths.length },
    checks,
    business: { countBefore: business.countBefore, countAfter: business.countAfter, changes: business.changes },
    conflicts,
    audit: { expected: expectedAudits.size, actual: auditPaths.length, duplicateObjects: [...seenObjects.entries()].filter(([, count]) => count > 1).map(([id]) => id) },
    migration: { status: migration.status ?? null, progress: migration.progress ?? null, baseBudget: BASE_IMPORT_BUDGET },
    idempotency: idem.skipped === true
      ? { mode: "read-only", invoked: false, note: IDEMPOTENCY_SKIPPED }
      : {
        mode: input.mode === "production" ? "read-only" : "emulator",
        invoked: true,
        actualContentWrites: idem.actualContentWrites ?? null,
        actualAuditWrites: idem.actualAuditWrites ?? null,
      },
    passed: checks.filter((item) => item.status !== "skipped").every((item) => item.passed),
  };
}

export function verificationActions(mode) {
  if (mode === "production") return { resume: false, rulesClient: false, writes: false };
  if (mode === "emulator") return { resume: false, rulesClient: true, writes: false };
  throw new Error("mode must be emulator or production");
}

export function businessReport(before, after) {
  return compareBusiness(before, after);
}

export async function checkDraftReads({ host, port, projectId, draftPath }) {
  const { initializeTestEnvironment } = await import("@firebase/rules-unit-testing");
  const { doc, getDoc } = await import("firebase/firestore");
  const rules = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port) },
  });
  const outcome = async (database) => {
    try {
      await getDoc(doc(database, draftPath));
      return "allowed";
    } catch {
      return "denied";
    }
  };
  try {
    return {
      anonymous: await outcome(rules.unauthenticatedContext().firestore()),
      signedIn: await outcome(rules.authenticatedContext("signed-in-user").firestore()),
      admin: await outcome(rules.authenticatedContext("catalog-admin", { catalogAdmin: true }).firestore()),
    };
  } finally {
    await rules.cleanup();
  }
}

export function resumeIdempotency({ runId, projectId, rootDir }) {
  const child = spawnSync(process.execPath, [
    path.join(rootDir, "scripts/catalog/run-import.mjs"),
    "--mode", "resume", "--execute", "--target", "emulator",
    "--runId", runId, "--project", projectId,
  ], { cwd: rootDir, encoding: "utf8", env: process.env });
  if (child.status !== 0) {
    return { actualContentWrites: null, actualAuditWrites: null, passed: false };
  }
  const report = JSON.parse(child.stdout);
  return {
    actualContentWrites: report.actualContentWrites,
    actualAuditWrites: report.actualAuditWrites,
    passed: report.actualContentWrites === 0 && report.actualAuditWrites === 0,
  };
}
