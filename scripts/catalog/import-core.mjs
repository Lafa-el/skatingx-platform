// Shared catalog import core.
// demo- projects run on the emulator. skatingx-prod writes require a granted
// service-account identity and the production write switch.
//
// F01: every read, write, check, and rollback touches only the planned catalog
// paths (one parent and one snapshot per object) plus the audit and migration
// documents for this runId. There is no collection-group query.
// F02: beginRun stores one migration record per runId, including the importedAt
// used to build documents. A later process with the same runId reuses that
// record and rebuilds the same documents. Matching documents are not written.
// A stored document that differs from the plan throws the path and the expected
// and actual checksums, and is never overwritten.
// One lock document, __import_lock, is the run mutex. It is not catalog content
// and is part of the execution budget. Only the token holder may write.
// A second executor is refused while that token is held. Taking over a live
// holder requires recoverImportLock with an explicit confirmation. There is no
// timeout takeover. Create-only batches use batch.create so an existing path
// fails the batch instead of being overwritten.
// F03: initial import checks an empty catalog before creating a run. Resume
// rebuilds documents from the stored importedAt and actor, writes only fully
// missing object groups, and refuses partial groups or content drift.
// F04: rollback deletes parent and snapshot documents only, and only after the
// holder and the stored plan have been checked. Import audit records stay.
// The migration status becomes rolled_back and rolledBackAt is set.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_PRODUCTION_SERVICE_ACCOUNTS,
  EXPECTED_DATABASE_ID,
  PRODUCTION_PROJECT_ID,
} from "./import-guard.mjs";

import {
  CATALOG_SCHEMA_VERSION,
  INITIAL_REVIEW_STATUS,
  canonicalCatalogJson,
  contentChecksumPayload,
  mapInventoryRecordToCatalogContent,
} from "../../packages/training-catalog/src/index.ts";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum.ts";

export const EXPECTED_WORKBOOK_SHA256 =
  "15e36d07501eaa514fc74a069060a56e1b387df8825f3369f1966112c93b180b";
export const CONTENT_VERSION = "v1";
export const IMPORT_ACTOR = "catalog-import";

const BATCH_LIMIT = 400;
const DOCS_PER_OBJECT = 3;
const MAX_OBJECTS_PER_BATCH = Math.floor(BATCH_LIMIT / DOCS_PER_OBJECT);
const BASE_CONTENT_DOCS = 514;

export function executionBudget(parentCount) {
  const parents = parentCount;
  const batches = parents === 0 ? 0 : Math.ceil(parents / MAX_OBJECTS_PER_BATCH);
  const content = parents * 2;
  const audits = parents;
  const migrationCreate = 1;
  const progressUpdates = batches;
  const lockCreate = 1;
  const lockRelease = 1;
  const contentLockFence = batches;
  const progressLockFence = batches;
  return content + audits + migrationCreate + progressUpdates + lockCreate + lockRelease + contentLockFence + progressLockFence;
}

export const BASE_IMPORT_BUDGET = executionBudget(257);
const ROOT = "artifacts/skatingx-production";
const OBJECTS = "trainingCatalogObjects";
const AUDIT = "trainingCatalogAuditLogs";
const MIGRATIONS = "trainingCatalogMigrations";
export const CATALOG_COLLECTIONS = [
  "trainingCatalogObjects",
  "trainingCatalogKnowledgeArticles",
  "trainingCatalogEvidenceRecords",
  "trainingCatalogTeachingMedia",
  "trainingCatalogCorrectionRules",
  "trainingCatalogSafetyPolicies",
  "trainingCatalogLinks",
  "trainingCatalogReleases",
  "trainingCatalogMigrations",
  "trainingCatalogAuditLogs",
  "trainingCatalogPublicLinks",
];

const SHEETS = [
  { sheet: "exercises", kind: "exercise" },
  { sheet: "drills", kind: "drill" },
  { sheet: "blocks", kind: "block" },
  { sheet: "sessions", kind: "session" },
];

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const inventoryPath = path.join(rootDir, "docs/skatingx-v2/inventory/workbook-inventory.json");

function collectionPath(name) {
  return `${ROOT}/${name}`;
}

function objectPath(objectId) {
  return `${collectionPath(OBJECTS)}/${objectId}`;
}

function migrationPath(runId) {
  return `${collectionPath(MIGRATIONS)}/${runId}`;
}

export const IMPORT_LOCK_ID = "__import_lock";

export function importLockPath() {
  return migrationPath(IMPORT_LOCK_ID);
}

export function auditDocId(runId, objectId) {
  return `imp-${runId}-${objectId}`;
}

function auditPath(runId, objectId) {
  return `${collectionPath(AUDIT)}/${auditDocId(runId, objectId)}`;
}

export function assertDemoProjectId(projectId) {
  if (typeof projectId !== "string" || !projectId.startsWith("demo-")) {
    throw new Error("refusing to run: project id must start with demo-");
  }
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("refusing to run: FIRESTORE_EMULATOR_HOST is not set");
  }
}

export function projectIdOf(db) {
  const settings = db._settings;
  if (settings && typeof settings.projectId === "string" && settings.projectId !== "") {
    return settings.projectId;
  }
  return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
}

let productionWriteGrant = null;

export function grantProductionWrite(identity) {
  if (!identity || identity.type !== "service_account") {
    throw new Error("refusing to run: production write identity is not verified");
  }
  if (typeof identity.clientEmail !== "string" || !ALLOWED_PRODUCTION_SERVICE_ACCOUNTS.includes(identity.clientEmail)) {
    throw new Error("refusing to run: service account is not allowed");
  }
  if (identity.projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error("refusing to run: credential project does not match the target project");
  }
  productionWriteGrant = {
    type: "service_account",
    clientEmail: identity.clientEmail,
    projectId: identity.projectId,
  };
  return productionWriteGrant;
}

export function clearProductionWriteGrant() {
  productionWriteGrant = null;
}

export function productionWriteIdentity() {
  return productionWriteGrant ? { ...productionWriteGrant } : null;
}

function assertWritableProject(db) {
  const projectId = projectIdOf(db);
  if (typeof projectId === "string" && projectId.startsWith("demo-")) {
    assertDemoProjectId(projectId);
    return { projectId, serviceAccount: "emulator" };
  }
  if (projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error("refusing to run: project id must start with demo-");
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("refusing to run: FIRESTORE_EMULATOR_HOST must be unset for production");
  }
  if (databaseIdOf(db) !== EXPECTED_DATABASE_ID) {
    throw new Error("refusing to run: database id must be (default)");
  }
  if (!productionWriteGrant) {
    throw new Error("refusing to run: production write is disabled");
  }
  return { projectId, serviceAccount: productionWriteGrant.clientEmail };
}

function assertReadMode(db, mode) {
  if (mode === "production") {
    const projectId = projectIdOf(db);
    if (projectId !== PRODUCTION_PROJECT_ID) {
      throw new Error("refusing to read: production mode requires project id skatingx-prod");
    }
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("refusing production read while FIRESTORE_EMULATOR_HOST is set");
    }
    if (databaseIdOf(db) !== EXPECTED_DATABASE_ID) {
      throw new Error("refusing to read: database id must be (default)");
    }
    return;
  }
  if (mode !== "emulator") throw new Error(`refusing to read: unknown mode ${mode}`);
  assertDemoProjectId(projectIdOf(db));
}

function readModeOf(db) {
  return projectIdOf(db) === PRODUCTION_PROJECT_ID ? "production" : "emulator";
}

export function databaseIdOf(db) {
  if (typeof db.databaseId === "string" && db.databaseId !== "") return db.databaseId;
  const settings = db._settings;
  if (settings && typeof settings.databaseId === "string" && settings.databaseId !== "") {
    return settings.databaseId;
  }
  return "(default)";
}

export function actorOf(record) {
  if (record && typeof record.actor === "string" && record.actor.trim() !== "") return record.actor.trim();
  return IMPORT_ACTOR;
}

export function planSummary(plans) {
  const parents = plans.filter((plan) => !plan.path.includes("/versions/"));
  const rows = parents
    .map((plan) => ({ id: plan.data.id, checksum: plan.data.checksum }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return {
    parents: parents.length,
    versions: parents.length,
    audits: parents.length,
    digest: createHash("sha256").update(canonicalCatalogJson(rows), "utf8").digest("hex"),
  };
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asInventoryRecord(value, label) {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id === "" ||
    typeof value.nameZh !== "string" ||
    typeof value.nameEn !== "string" ||
    !isRecord(value.legacyAttributes)
  ) {
    throw new Error(`invalid inventory record ${label}`);
  }
  return value;
}

export function documentData(value) {
  const parsed = JSON.parse(canonicalCatalogJson(value));
  if (!isRecord(parsed)) throw new Error("canonical document was not an object");
  return parsed;
}

function objectIdFromPath(docPath) {
  const marker = `/${OBJECTS}/`;
  const start = docPath.indexOf(marker);
  if (start < 0) throw new Error(`not a catalog object path: ${docPath}`);
  return docPath.slice(start + marker.length).split("/")[0];
}

function checksumField(data) {
  return isRecord(data) && typeof data.checksum === "string" ? data.checksum : "(missing)";
}

export function loadPlans(importedAt) {
  if (typeof importedAt !== "string" || Number.isNaN(Date.parse(importedAt))) {
    throw new Error("importedAt must be an ISO timestamp");
  }
  const parsed = JSON.parse(readFileSync(inventoryPath, "utf8"));
  if (!isRecord(parsed) || typeof parsed.workbookSha256 !== "string" || !isRecord(parsed.objects)) {
    throw new Error("workbook inventory shape is invalid");
  }
  if (parsed.workbookSha256 !== EXPECTED_WORKBOOK_SHA256) {
    throw new Error(`workbookSha256 mismatch: ${parsed.workbookSha256}`);
  }
  const plans = [];
  for (const { sheet, kind } of SHEETS) {
    const rows = parsed.objects[sheet];
    if (!Array.isArray(rows)) throw new Error(`inventory sheet ${sheet} is missing`);
    rows.forEach((row, index) => {
      const record = asInventoryRecord(row, `${sheet}[${index}]`);
      const content = mapInventoryRecordToCatalogContent(kind, record);
      const parent = {
        id: record.id,
        kind,
        sportId: "short_track",
        localeContent: content.localeContent,
        taxonomy: content.taxonomy,
        refs: content.refs,
        legacyAttributes: content.legacyAttributes,
        schemaVersion: CATALOG_SCHEMA_VERSION,
        contentVersion: CONTENT_VERSION,
        status: "draft",
        reviewStatus: INITIAL_REVIEW_STATUS,
        checksum: computeCatalogChecksum(
          contentChecksumPayload({ ...content, schemaVersion: CATALOG_SCHEMA_VERSION }),
        ),
        createdAt: importedAt,
        updatedAt: importedAt,
      };
      const version = {
        contentVersion: parent.contentVersion,
        status: parent.status,
        reviewStatus: parent.reviewStatus,
        checksum: parent.checksum,
        localeContent: parent.localeContent,
        taxonomy: parent.taxonomy,
        refs: parent.refs,
        legacyAttributes: parent.legacyAttributes,
        schemaVersion: parent.schemaVersion,
      };
      plans.push({ path: objectPath(parent.id), data: parent });
      plans.push({ path: `${objectPath(parent.id)}/versions/${CONTENT_VERSION}`, data: version });
    });
  }
  return { workbookSha256: parsed.workbookSha256, plans };
}

function objectPlans(plans, runId, context) {
  const actor = requireText(context.actor, "actor");
  const importedAt = requireText(context.importedAt, "importedAt");
  const id = requireText(runId, "runId");
  const grouped = new Map();
  for (const plan of plans) {
    const objectId = objectIdFromPath(plan.path);
    const current = grouped.get(objectId) ?? { id: objectId, parent: null, version: null };
    if (plan.path.includes("/versions/")) current.version = plan;
    else current.parent = plan;
    grouped.set(objectId, current);
  }
  return [...grouped.values()].map((object) => {
    if (object.parent === null || object.version === null) {
      throw new Error(`plan is missing parent or snapshot for ${object.id}`);
    }
    const parent = object.parent.data;
    const audit = {
      path: auditPath(id, object.id),
      data: {
        action: "import",
        actor,
        operator: requireText(context.operator ?? actor, "operator"),
        serviceAccount: requireText(context.serviceAccount ?? "emulator", "serviceAccount"),
        target: { collection: OBJECTS, id: object.id, contentVersion: parent.contentVersion },
        at: importedAt,
        runId: id,
        checksum: parent.checksum,
        result: "ok",
      },
    };
    return { id: object.id, docs: [object.parent, object.version, audit] };
  });
}

export function planBatches(plans, runId, context) {
  const objects = objectPlans(plans, runId, context);
  const batches = [];
  for (let index = 0; index < objects.length; index += MAX_OBJECTS_PER_BATCH) {
    const docs = [];
    for (const object of objects.slice(index, index + MAX_OBJECTS_PER_BATCH)) {
      docs.push(...object.docs);
    }
    batches.push(docs);
  }
  return batches;
}

export async function readPlannedDocs(db, plans, mode = "emulator") {
  assertReadMode(db, mode);
  const found = new Map();
  const chunkSize = 200;
  for (let index = 0; index < plans.length; index += chunkSize) {
    const slice = plans.slice(index, index + chunkSize);
    const snaps = await db.getAll(...slice.map((plan) => db.doc(plan.path)));
    for (const snap of snaps) {
      if (snap.exists) found.set(snap.ref.path, snap.data());
    }
  }
  return found;
}

export function dumpCatalog(docs) {
  const sorted = [...docs.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return canonicalCatalogJson(Object.fromEntries(sorted));
}

function sameDocument(actual, expected) {
  return canonicalCatalogJson(actual) === canonicalCatalogJson(documentData(expected));
}

function presenceLabel(present, name) {
  return `${name} ${present ? "present" : "missing"}`;
}

function classifyObject(object, existing) {
  const states = object.docs.map((doc) => {
    const current = existing.get(doc.path);
    if (current === undefined) return { doc, state: "missing" };
    if (!sameDocument(current, doc.data)) {
      return {
        doc,
        state: "mismatch",
        detail: `${doc.path} expected checksum ${checksumField(documentData(doc.data))} actual checksum ${checksumField(current)}`,
      };
    }
    return { doc, state: "match" };
  });
  if (states.some((item) => item.state === "mismatch")) {
    return { kind: "mismatch", details: states.filter((item) => item.state === "mismatch").map((item) => item.detail) };
  }
  if (states.every((item) => item.state === "match")) return { kind: "present" };
  if (states.every((item) => item.state === "missing")) return { kind: "absent" };
  const [parent, version, audit] = states;
  return {
    kind: "incomplete",
    detail: `incomplete object group ${object.id}: ${presenceLabel(parent.state !== "missing", "parent")}, ${presenceLabel(version.state !== "missing", "snapshot")}, ${presenceLabel(audit.state !== "missing", "audit")}`,
  };
}

export async function inspectCatalog(db) {
  const collectionDocs = new Map();
  for (const name of CATALOG_COLLECTIONS) {
    const snap = await db.collection(collectionPath(name)).get();
    collectionDocs.set(name, snap.docs.map((item) => item.ref.path));
  }
  const orphans = [];
  const versionPaths = [];
  const refs = await db.collection(collectionPath(OBJECTS)).listDocuments();
  for (const ref of refs) {
    const parent = await ref.get();
    const versions = await ref.collection("versions").get();
    for (const version of versions.docs) versionPaths.push(version.ref.path);
    if (!parent.exists) {
      if (versions.empty) orphans.push(ref.path);
      for (const version of versions.docs) orphans.push(version.ref.path);
    }
  }
  return { collectionDocs, orphans, versionPaths };
}

function allowedPaths(plans, runId) {
  const allowed = new Set(plans.map((plan) => plan.path));
  for (const plan of plans) {
    if (!plan.path.includes("/versions/")) allowed.add(auditPath(runId, plan.data.id));
  }
  allowed.add(migrationPath(runId));
  allowed.add(importLockPath());
  return allowed;
}

function newLockToken() {
  return randomBytes(32).toString("hex");
}

function parentPathPattern() {
  return new RegExp(`^${collectionPath(OBJECTS)}/[^/]+$`);
}

function snapshotPathPattern() {
  return new RegExp(`^${collectionPath(OBJECTS)}/[^/]+/versions/${CONTENT_VERSION}$`);
}

function isParentPath(docPath) {
  return parentPathPattern().test(docPath);
}

function isSnapshotPath(docPath) {
  return snapshotPathPattern().test(docPath);
}

function contentPathsOf(plans) {
  if (!Array.isArray(plans)) throw new Error("delete refused: verified plan is required");
  const allowed = new Set();
  for (const plan of plans) {
    const docPath = plan && typeof plan.path === "string" ? plan.path : "";
    if (!isParentPath(docPath) && !isSnapshotPath(docPath)) {
      throw new Error(`delete refused: verified plan contains ${docPath || "(missing path)"}`);
    }
    if (allowed.has(docPath)) throw new Error(`delete refused: verified plan repeats ${docPath}`);
    allowed.add(docPath);
  }
  return allowed;
}

function deletionProblem(docPath, allowed) {
  if (typeof docPath !== "string" || docPath.trim() === "" || docPath !== docPath.trim() || docPath.includes("//")) {
    return `malformed path ${String(docPath)}`;
  }
  if (docPath.includes("/trainingCatalogAuditLogs/") || docPath.includes("/trainingCatalogMigrations/")) {
    return `refusing to delete run record ${docPath}`;
  }
  if (!isParentPath(docPath) && !isSnapshotPath(docPath)) {
    return `path is outside the verified plan ${docPath}`;
  }
  if (!allowed.has(docPath)) return `path is outside the verified plan ${docPath}`;
  return "";
}

async function assertCatalogEmptyForInitial(tx, db) {
  for (const name of CATALOG_COLLECTIONS) {
    const snap = await tx.get(db.collection(collectionPath(name)));
    for (const doc of snap.docs) {
      if (doc.ref.path === importLockPath()) continue;
      throw new Error(`initial refused: ${name} is not empty (${doc.ref.path})`);
    }
  }
}

async function claimLock(db, claim) {
  const ref = db.doc(importLockPath());
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("import refused: lock is missing");
    const lock = snap.data();
    if (lock.runId !== claim.runId || lock.token !== claim.token || lock.actor !== claim.actor) {
      throw new Error(`import refused: lock is not held by ${claim.runId}`);
    }
    if (lock.status === "held") return;
    if (lock.status === "released" || lock.status === "failed") {
      tx.update(ref, { status: "held", acquiredAt: new Date().toISOString() });
      return;
    }
    throw new Error(`import refused: lock is ${lock.status}`);
  });
}

async function updateHeldLock(db, claim, patch) {
  const ref = db.doc(importLockPath());
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("import refused: lock is missing");
    const lock = snap.data();
    if (lock.status !== "held" || lock.token !== claim.token || lock.runId !== claim.runId || lock.actor !== claim.actor) {
      throw new Error("import refused: refusing to change a lock held by another executor");
    }
    tx.update(ref, patch);
  });
}

async function failLock(db, claim, failure) {
  const ref = db.doc(importLockPath());
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const lock = snap.data();
    if (lock.status !== "held" || lock.token !== claim.token || lock.runId !== claim.runId) return;
    tx.update(ref, {
      status: "failed",
      failedAt: new Date().toISOString(),
      failure: String(failure).slice(0, 500),
    });
  });
}

function batchLine(batch) {
  return `batch ${batch.index} objects=${batch.objects} writes=${batch.writes} cumulativeContent=${batch.cumulativeContent} cumulativeAudits=${batch.cumulativeAudits}`;
}

export async function preflightInitial(db, plans) {
  assertWritableProject(db);
  if (plans.length !== BASE_CONTENT_DOCS) {
    throw new Error(`initial refused: planned content paths ${plans.length} expected ${BASE_CONTENT_DOCS}`);
  }
  const summary = planSummary(plans);
  const budget = executionBudget(summary.parents);
  if (summary.parents !== 257 || budget !== BASE_IMPORT_BUDGET) {
    throw new Error(`initial refused: write budget ${budget} expected ${BASE_IMPORT_BUDGET}`);
  }
  const inspected = await inspectCatalog(db);
  if (inspected.orphans.length > 0) {
    throw new Error(`initial refused: orphan catalog path ${inspected.orphans[0]}`);
  }
  for (const [name, paths] of inspected.collectionDocs) {
    const content = paths.filter((docPath) => docPath !== importLockPath());
    if (content.length > 0) throw new Error(`initial refused: ${name} is not empty (${content[0]})`);
  }
  const existing = await readPlannedDocs(db, plans, readModeOf(db));
  if (existing.size > 0) {
    throw new Error(`initial refused: planned path already exists ${existing.keys().next().value}`);
  }
  return { planSummary: summary, baseBudget: budget, plannedMigrationCreates: 1 };
}

export async function assertResumeCatalog(db, plans, runId) {
  assertWritableProject(db);
  const allowed = allowedPaths(plans, runId);
  const inspected = await inspectCatalog(db);
  const unknown = [...inspected.orphans];
  for (const paths of inspected.collectionDocs.values()) {
    for (const docPath of paths) {
      if (docPath === importLockPath()) continue;
      if (!allowed.has(docPath)) unknown.push(docPath);
    }
  }
  for (const docPath of inspected.versionPaths) {
    if (!allowed.has(docPath)) unknown.push(docPath);
  }
  if (unknown.length > 0) throw new Error(`resume refused: unknown catalog path ${unknown[0]}`);
  const migration = await db.doc(migrationPath(runId)).get();
  if (!migration.exists) throw new Error(`migration ${runId} does not exist`);
  if (migration.data().status === "rolled_back") {
    throw new Error(`resume refused: run ${runId} is rolled_back`);
  }
  return migration.data();
}

export async function previewImport(db, plans, context) {
  const writable = assertWritableProject(db);
  const runId = requireText(context.runId, "runId");
  const importedAt = requireText(context.importedAt, "importedAt");
  const actor = requireText(context.actor ?? IMPORT_ACTOR, "actor");
  const serviceAccount = requireText(context.serviceAccount ?? writable.serviceAccount, "serviceAccount");
  const objects = objectPlans(plans, runId, { actor, importedAt, serviceAccount, operator: actor });
  const existing = await readPlannedDocs(
    db,
    objects.flatMap((object) => object.docs),
    readModeOf(db),
  );
  const mismatched = [];
  const incomplete = [];
  let present = 0;
  let absent = 0;
  for (const object of objects) {
    const classified = classifyObject(object, existing);
    if (classified.kind === "mismatch") mismatched.push(...classified.details);
    else if (classified.kind === "incomplete") incomplete.push(classified.detail);
    else if (classified.kind === "absent") absent += 1;
    else present += 1;
  }
  return {
    present,
    absent,
    mismatched,
    incomplete,
    plannedContentWrites: absent * 2,
    plannedAuditWrites: absent,
    plannedMigrationCreates: 0,
    baseBudget: BASE_IMPORT_BUDGET,
    roundBudget: absent * DOCS_PER_OBJECT,
    remainingObjectGroups: absent,
  };
}

async function recordProgress(db, migrationRef, fields, committedBatch, claim) {
  const lockRef = db.doc(importLockPath());
  const lockSnap = await lockRef.get();
  if (!lockSnap.exists || lockSnap.data().token !== claim.token || lockSnap.data().status !== "held" || lockSnap.data().runId !== claim.runId) {
    throw new Error(`import refused: lock is not held by ${claim.runId}`);
  }
  const migrationSnap = await migrationRef.get();
  if (!migrationSnap.exists || !migrationSnap.updateTime) {
    throw new Error("migration progress update failed: migration precondition is missing");
  }
  try {
    const batch = db.batch();
    batch.update(migrationRef, { ...fields, updatedAt: new Date().toISOString() }, { lastUpdateTime: migrationSnap.updateTime });
    batch.update(lockRef, { lastProgressAt: new Date().toISOString() }, { lastUpdateTime: lockSnap.updateTime });
    await batch.commit();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (committedBatch) {
      throw new Error(
        `batch ${fields.lastCompletedBatch} committed ${committedBatch.objects} objects; migration progress update failed: ${reason}`,
        { cause: error },
      );
    }
    throw new Error(`migration progress update failed after content was already committed: ${reason}`, { cause: error });
  }
}

export async function executeImport(db, plans, context) {
  const writable = assertWritableProject(db);
  if (writable.projectId === PRODUCTION_PROJECT_ID && context.stopAfterObjects !== undefined) {
    throw new Error("refusing to run: test limits are not available for production");
  }
  const runId = requireText(context.runId, "runId");
  const importedAt = requireText(context.importedAt, "importedAt");
  const actor = requireText(context.actor ?? IMPORT_ACTOR, "actor");
  const serviceAccount = requireText(context.serviceAccount ?? writable.serviceAccount, "serviceAccount");
  const operator = requireText(context.operator ?? actor, "operator");
  const token = requireText(context.lockToken, "lockToken");
  const claim = { runId, actor, token };
  let owned = false;
  try {
    await claimLock(db, claim);
    owned = true;
    const objects = objectPlans(plans, runId, { actor, importedAt, serviceAccount, operator });
    const existing = await readPlannedDocs(
      db,
      objects.flatMap((object) => object.docs),
      readModeOf(db),
    );
    const mismatches = [];
    const incomplete = [];
    const absent = [];
    let skippedExisting = 0;
    for (const object of objects) {
      const classified = classifyObject(object, existing);
      if (classified.kind === "mismatch") mismatches.push(...classified.details);
      else if (classified.kind === "incomplete") incomplete.push(classified.detail);
      else if (classified.kind === "absent") absent.push(object);
      else skippedExisting += 1;
    }
    if (mismatches.length > 0) throw new Error(`import refused: ${mismatches.join("; ")}`);
    if (incomplete.length > 0) throw new Error(`import refused: ${incomplete.join("; ")}`);
    const limit = context.stopAfterObjects;
    const work =
      typeof limit === "number" && limit >= 0 ? absent.slice(0, limit) : absent;
    const batches = [];
    let cumulativeContent = skippedExisting * 2;
    let cumulativeAudits = skippedExisting;
    let committedObjects = 0;
    const migrationRef = db.doc(migrationPath(runId));
    const lockRef = db.doc(importLockPath());
    for (let index = 0; index < work.length; index += MAX_OBJECTS_PER_BATCH) {
      const slice = work.slice(index, index + MAX_OBJECTS_PER_BATCH);
      const batchIndex = batches.length + 1;
      const paths = slice.flatMap((object) => object.docs.map((doc) => doc.path));
      await claimLock(db, claim);
      const lockSnap = await lockRef.get();
      if (!lockSnap.exists || lockSnap.data().token !== token || !lockSnap.updateTime) {
        throw new Error(`import refused: lock is not held by ${runId}`);
      }
      const lockTime = lockSnap.updateTime;
      if (typeof context.beforeBatch === "function") {
        await context.beforeBatch({ index: batchIndex, paths });
      }
      const batch = db.batch();
      for (const object of slice) {
        for (const doc of object.docs) batch.create(db.doc(doc.path), documentData(doc.data));
      }
      batch.update(lockRef, {
        lastBatch: batchIndex,
        lastBatchAt: new Date().toISOString(),
      }, { lastUpdateTime: lockTime });
      try {
        await batch.commit();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const preconditionFailed = /precondition|last-update-time|FAILED_PRECONDITION/i.test(reason);
        if (reason.startsWith("injected ") || preconditionFailed) {
          throw new Error(`import refused: batch ${batchIndex} commit failed: ${reason}`, { cause: error });
        }
        const found = await readPlannedDocs(db, paths.map((docPath) => ({ path: docPath })), readModeOf(db));
        const conflicts = [...found.keys()];
        throw new Error(
          `import refused: create conflict ${conflicts.join(", ") || "(path unavailable)"}: ${reason}`,
          { cause: error },
        );
      }
      cumulativeContent += slice.length * 2;
      cumulativeAudits += slice.length;
      committedObjects += slice.length;
      const entry = {
        index: batchIndex,
        objects: slice.length,
        writes: slice.length * DOCS_PER_OBJECT,
        cumulativeContent,
        cumulativeAudits,
      };
      batches.push(entry);
      const remainingAfterBatch = absent.length - committedObjects;
      const progress = {
        completedObjects: skippedExisting + committedObjects,
        remainingObjects: remainingAfterBatch,
      };
      const runStatus = remainingAfterBatch === 0 ? "completed" : "running";
      await recordProgress(db, migrationRef, {
        status: runStatus,
        progress,
        completedObjects: progress.completedObjects,
        remainingObjects: progress.remainingObjects,
        cumulativeContentWrites: cumulativeContent,
        cumulativeAuditWrites: cumulativeAudits,
        roundContentWrites: committedObjects * 2,
        roundAuditWrites: committedObjects,
        lastCompletedBatch: batchIndex,
      }, entry, claim);
      console.error(batchLine(entry));
    }
    const remainingPlanned = absent.length - work.length;
    const runStatus = remainingPlanned === 0 ? "completed" : "running";
    let actualMigrationWrites = batches.length;
    if (work.length === 0) {
      const progress = { completedObjects: skippedExisting, remainingObjects: remainingPlanned };
      const current = (await migrationRef.get()).data() ?? {};
      const rebuiltContent = skippedExisting * 2;
      const rebuiltAudits = skippedExisting;
      const sameProgress =
        current.status === runStatus &&
        current.progress?.completedObjects === progress.completedObjects &&
        current.progress?.remainingObjects === progress.remainingObjects &&
        current.cumulativeContentWrites === rebuiltContent &&
        current.cumulativeAuditWrites === rebuiltAudits;
      if (!sameProgress) {
        await recordProgress(db, migrationRef, {
          status: runStatus,
          progress,
          completedObjects: progress.completedObjects,
          remainingObjects: progress.remainingObjects,
          cumulativeContentWrites: rebuiltContent,
          cumulativeAuditWrites: rebuiltAudits,
          roundContentWrites: 0,
          roundAuditWrites: 0,
          lastCompletedBatch: current.lastCompletedBatch ?? 0,
        }, null, claim);
        actualMigrationWrites += 1;
      }
    }
    await updateHeldLock(db, claim, { status: "released", releasedAt: new Date().toISOString() });
    return {
      plannedContentWrites: absent.length * 2,
      plannedAuditWrites: absent.length,
      plannedMigrationCreates: 0,
      actualContentWrites: work.length * 2,
      actualAuditWrites: work.length,
      actualMigrationWrites,
      skippedExisting,
      remainingPlanned,
      idempotent: work.length === 0 && remainingPlanned === 0,
      runStatus,
      batches,
    };
  } catch (error) {
    if (owned && context.leaveLockHeld !== true) {
      const reason = error instanceof Error ? error.message : String(error);
      try {
        await failLock(db, claim, reason);
      } catch (lockError) {
        const lockReason = lockError instanceof Error ? lockError.message : String(lockError);
        throw new Error(`${reason}; lock update failed: ${lockReason}`, { cause: lockError });
      }
    }
    throw error;
  }
}

export async function importDocuments(db, plans, context) {
  const report = await executeImport(db, plans, context);
  return report.actualContentWrites;
}

export async function deleteDocuments(db, request) {
  assertWritableProject(db);
  if (request.planSource !== "trusted") throw new Error("delete refused: plan source is not trusted");
  if (!(request.expected instanceof Map)) throw new Error("delete refused: expected documents are required");
  const runId = requireText(request.runId, "runId");
  const allowed = contentPathsOf(request.plans);
  const docPaths = request.paths;
  if (!Array.isArray(docPaths)) throw new Error("delete refused: paths are required");
  const seen = new Set();
  const problems = [];
  for (const docPath of docPaths) {
    if (typeof docPath === "string" && seen.has(docPath)) problems.push(`duplicate path ${docPath}`);
    if (typeof docPath === "string") seen.add(docPath);
    const problem = deletionProblem(docPath, allowed);
    if (problem) problems.push(problem);
  }
  if (problems.length > 0) throw new Error(`delete refused: ${problems.join("; ")}`);
  const token = requireText(request.lockToken, "lockToken");
  const lockSnap = await db.doc(importLockPath()).get();
  const lock = lockSnap.exists ? lockSnap.data() : null;
  if (!lock || lock.status !== "held" || lock.token !== token || lock.runId !== runId) {
    throw new Error(`delete refused: lock is not held by ${runId}`);
  }
  const snaps = new Map();
  for (const docPath of docPaths) {
    const snap = await db.doc(docPath).get();
    const actual = snap.exists ? canonicalCatalogJson(snap.data()) : "";
    if (actual !== request.expected.get(docPath)) {
      throw new Error(`rollback refused: ${docPath} changed after verification`);
    }
    if (!snap.exists || !snap.updateTime) throw new Error(`rollback refused: ${docPath} changed after verification`);
    snaps.set(docPath, snap);
  }
  const versions = docPaths.filter((docPath) => isSnapshotPath(docPath));
  const parents = docPaths.filter((docPath) => isParentPath(docPath));
  for (const group of [versions, parents]) {
    for (let index = 0; index < group.length; index += BATCH_LIMIT) {
      const batch = db.batch();
      for (const docPath of group.slice(index, index + BATCH_LIMIT)) {
        const snap = snaps.get(docPath);
        batch.delete(db.doc(docPath), { lastUpdateTime: snap.updateTime });
      }
      await batch.commit();
    }
  }
}

export async function beginRun(db, input) {
  assertWritableProject(db);
  const runId = requireText(input.runId, "runId");
  if (runId === IMPORT_LOCK_ID) throw new Error("refusing to run: runId is reserved");
  const workbookSha256 = requireText(input.workbookSha256, "workbookSha256");
  if (workbookSha256 !== EXPECTED_WORKBOOK_SHA256) {
    throw new Error(`workbookSha256 mismatch: ${workbookSha256}`);
  }
  const requestedActor = typeof input.actor === "string" ? input.actor.trim() : "";
  const importedAt = new Date().toISOString();
  const summary = planSummary(loadPlans(importedAt).plans);
  const ref = db.doc(migrationPath(runId));
  const lockRef = db.doc(importLockPath());
  return db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef);
    const snap = await tx.get(ref);
    const lock = lockSnap.exists ? lockSnap.data() : null;
    if (input.initial === true && snap.exists) {
      throw new Error(`initial refused: migration ${runId} already exists`);
    }
    const suppliedToken = typeof input.lockToken === "string" ? input.lockToken : "";
    if (lock?.status === "held" && snap.exists && input.initial !== true && suppliedToken !== "" && lock.token === suppliedToken && lock.runId === runId) {
      const stored = snap.data();
      if (stored.status === "rolled_back") throw new Error(`resume refused: run ${runId} is rolled_back`);
      const actor = actorOf(stored);
      if (requestedActor !== "" && requestedActor !== actor) {
        throw new Error(`actor mismatch: expected ${actor}`);
      }
      if (stored.workbookSha256 !== workbookSha256) {
        throw new Error(`resume refused: workbookSha256 expected ${stored.workbookSha256}`);
      }
      return { ...stored, created: false, lockToken: suppliedToken };
    }
    if (lock?.status === "held") throw new Error(`import lock is held by ${lock.runId}`);
    if (lock && lock.runId !== runId && lock.status !== "released" && lock.status !== "rolled_back") {
      throw new Error(`import lock belongs to ${lock.runId}`);
    }
    if (!snap.exists && input.initial === true) await assertCatalogEmptyForInitial(tx, db);
    if (snap.exists) {
      const stored = snap.data();
      if (stored.status === "rolled_back") throw new Error(`resume refused: run ${runId} is rolled_back`);
      const actor = actorOf(stored);
      if (requestedActor !== "" && requestedActor !== actor) {
        throw new Error(`actor mismatch: expected ${actor}`);
      }
      const token = newLockToken();
      tx.set(lockRef, {
        runId,
        actor,
        acquiredAt: new Date().toISOString(),
        status: "held",
        token,
        previousToken: lock?.token ?? null,
        previousStatus: lock?.status ?? "absent",
      });
      return { ...stored, created: false, lockToken: token };
    }
    const actor = requestedActor !== "" ? requestedActor : IMPORT_ACTOR;
    const serviceAccount = typeof input.serviceAccount === "string" && input.serviceAccount.trim() !== ""
      ? input.serviceAccount.trim()
      : assertWritableProject(db).serviceAccount;
    const token = newLockToken();
    const record = {
      runId,
      actor,
      operator: actor,
      serviceAccount,
      importedAt,
      workbookSha256,
      projectId: projectIdOf(db),
      databaseId: databaseIdOf(db),
      planSummary: summary,
      progress: { completedObjects: 0, remainingObjects: summary.parents },
      completedObjects: 0,
      remainingObjects: summary.parents,
      cumulativeContentWrites: 0,
      cumulativeAuditWrites: 0,
      lastCompletedBatch: 0,
      status: "running",
    };
    if (typeof input.gitSha === "string" && input.gitSha.trim() !== "") record.gitSha = input.gitSha.trim();
    tx.set(ref, record);
    tx.set(lockRef, {
      runId,
      actor,
      acquiredAt: importedAt,
      status: "held",
      token,
      previousToken: lock?.token ?? null,
      previousStatus: lock?.status ?? "absent",
    });
    return { ...record, created: true, lockToken: token };
  });
}

export async function recoverImportLock(db, input) {
  const writable = assertWritableProject(db);
  if (input.confirmHolderDead !== true) {
    throw new Error("lock recovery refused: holder has not been confirmed dead");
  }
  const runId = requireText(input.runId, "runId");
  const actor = requireText(input.actor, "actor");
  const reason = requireText(input.reason, "reason");
  const lockRef = db.doc(importLockPath());
  const token = newLockToken();
  const recoveredAt = new Date().toISOString();
  let previousToken = "";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists || snap.data().status !== "held") {
      throw new Error("lock recovery refused: there is no active holder");
    }
    const lock = snap.data();
    if (lock.runId !== runId) throw new Error(`lock recovery refused: lock belongs to ${lock.runId}`);
    if (lock.actor !== actor) throw new Error("lock recovery refused: actor mismatch");
    previousToken = lock.token;
    tx.set(lockRef, {
      ...lock,
      token,
      previousToken: lock.token,
      previousStatus: lock.status,
      recoveredAt,
      recovery: "manual",
      recoveryReason: reason,
      status: "held",
    });
  });
  const auditId = `lockrec-${runId}-${createHash("sha256").update(recoveredAt).digest("hex").slice(0, 16)}`;
  await db.doc(`${collectionPath(AUDIT)}/${auditId}`).create({
    action: "lock-recovery",
    runId,
    actor,
    operator: actor,
    serviceAccount: writable.serviceAccount,
    previousToken,
    token,
    at: recoveredAt,
    reason,
    result: "ok",
  });
  return { runId, actor, lockToken: token, previousToken, recoveredAt, reason };
}

export function assertResumeIdentity(record, input) {
  const actor = requireText(input.actor, "actor");
  if (actor !== actorOf(record)) throw new Error(`actor mismatch: expected ${actorOf(record)}`);
  if (record.projectId !== input.projectId) {
    throw new Error(`resume refused: projectId expected ${record.projectId}`);
  }
  const databaseId = typeof record.databaseId === "string" && record.databaseId !== "" ? record.databaseId : "(default)";
  if (databaseId !== input.databaseId) throw new Error(`resume refused: databaseId expected ${databaseId}`);
  if (record.workbookSha256 !== input.workbookSha256) {
    throw new Error(`resume refused: workbookSha256 expected ${record.workbookSha256}`);
  }
  if (!record.planSummary || record.planSummary.digest !== input.planSummary.digest) {
    throw new Error("resume refused: plan summary does not match the stored run");
  }
  if (typeof record.importedAt !== "string" || Number.isNaN(Date.parse(record.importedAt))) {
    throw new Error("resume refused: stored importedAt is missing");
  }
  return { ...record, actor: actorOf(record) };
}

function auditProblem(auditData, { id, actor, objectId, parent, record }) {
  if (!auditData) return "audit missing";
  if (auditData.action !== "import" || auditData.result !== "ok" || auditData.runId !== id || auditData.actor !== actor) {
    return `audit does not belong to ${id}`;
  }
  if (auditData.checksum !== parent.checksum) return "audit checksum does not match the parent";
  const target = auditData.target;
  if (!target || target.collection !== OBJECTS || target.id !== objectId || target.contentVersion !== parent.contentVersion) {
    return "audit target does not match the parent";
  }
  if (auditData.at !== record.importedAt) return "audit time does not match the run";
  const operator = typeof record.operator === "string" && record.operator !== "" ? record.operator : actor;
  const serviceAccount = typeof record.serviceAccount === "string" && record.serviceAccount !== "" ? record.serviceAccount : "emulator";
  if (auditData.operator !== operator || auditData.serviceAccount !== serviceAccount) {
    return "audit identity does not match the run";
  }
  return "";
}

function draftProblem(docPath, data) {
  if (data.status !== "draft" || data.reviewStatus !== "pending") {
    return `rollback refused: ${docPath} is ${String(data.status)}/${String(data.reviewStatus)}`;
  }
  if (data.publishedVersion !== undefined || data.reviewer !== undefined || data.reviewedAt !== undefined) {
    return `rollback refused: ${docPath} has review or publication fields`;
  }
  return "";
}

export async function rollbackImport(db, runId, claim = {}) {
  assertWritableProject(db);
  const id = requireText(runId, "runId");
  const token = requireText(claim.lockToken, "lockToken");
  const ref = db.doc(migrationPath(id));
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`migration ${id} does not exist`);
  const record = snap.data();
  if (record.runId !== id) throw new Error(`rollback refused: migration runId is ${String(record.runId)}`);
  if (record.status === "rolled_back") throw new Error(`rollback refused: run ${id} is rolled_back`);
  if (record.workbookSha256 !== EXPECTED_WORKBOOK_SHA256) {
    throw new Error(`rollback refused: workbookSha256 expected ${EXPECTED_WORKBOOK_SHA256}`);
  }
  if (typeof record.importedAt !== "string" || Number.isNaN(Date.parse(record.importedAt))) {
    throw new Error("rollback refused: stored importedAt is missing");
  }
  const actor = actorOf(record);
  if (actor.trim() === "") throw new Error("rollback refused: stored actor is missing");
  const { plans } = loadPlans(record.importedAt);
  const summary = planSummary(plans);
  if (!record.planSummary || record.planSummary.digest !== summary.digest) {
    throw new Error("rollback refused: plan summary does not match the stored run");
  }
  await claimLock(db, { runId: id, actor, token });
  const fresh = await ref.get();
  if (!fresh.exists || fresh.data().workbookSha256 !== record.workbookSha256 || fresh.data().planSummary?.digest !== summary.digest) {
    throw new Error(`rollback refused: migration ${id} changed after the lock was claimed`);
  }
  const parents = plans.filter((plan) => isParentPath(plan.path));
  const auditPlans = parents.map((plan) => ({ path: auditPath(id, plan.data.id), id: plan.data.id }));
  const stored = await readPlannedDocs(db, [
    ...plans,
    ...auditPlans.map((plan) => ({ path: plan.path })),
  ], readModeOf(db));
  const recordedStage = fresh.data().rollbackProgress?.stage;
  let stage = recordedStage ?? "snapshots";
  if (stage !== "snapshots" && stage !== "parents" && stage !== "mark") {
    throw new Error("rollback refused: rollback stage is unknown");
  }
  const expected = new Map();
  const snapshotDeletes = [];
  const parentDeletes = [];
  let retainedAudits = 0;
  for (const parentPlan of parents) {
    const objectId = parentPlan.data.id;
    const parentPath = parentPlan.path;
    const snapshotPath = `${parentPath}/versions/${CONTENT_VERSION}`;
    const audit = auditPath(id, objectId);
    const parent = stored.get(parentPath);
    const snapshot = stored.get(snapshotPath);
    const auditData = stored.get(audit);
    const present = [parent, snapshot, auditData].filter((item) => item !== undefined).length;
    if (present === 0) {
      const collections = await db.doc(parentPath).listCollections();
      if (collections.length > 0) {
        throw new Error(`rollback refused: unexpected subcollection ${parentPath}/${collections[0].id}`);
      }
      continue;
    }
    const snapshotGone = parent && auditData && !snapshot;
    const contentGone = !parent && !snapshot && auditData;
    if (stage === "mark") {
      if (parent || snapshot) {
        throw new Error(`rollback refused: ${objectId} still has content during the mark stage`);
      }
      retainedAudits += auditData ? 1 : 0;
      continue;
    }
    if (stage === "parents" && contentGone) {
      retainedAudits += 1;
      continue;
    }
    if ((recordedStage === "snapshots" || recordedStage === "parents") && snapshotGone) {
      const parentDraft = draftProblem(parentPath, parent);
      if (parentDraft) throw new Error(parentDraft);
      if (!sameDocument(parent, parentPlan.data)) {
        throw new Error(`rollback refused: ${parentPath} does not match the stored plan`);
      }
      const problem = auditProblem(auditData, { id, actor, objectId, parent, record });
      if (problem) throw new Error(`rollback refused: ${problem} ${audit}`);
      expected.set(parentPath, canonicalCatalogJson(parent));
      parentDeletes.push(parentPath);
      retainedAudits += 1;
      continue;
    }
    if (present !== 3) {
      throw new Error(
        `rollback refused: incomplete object group ${objectId}: parent ${parent ? "present" : "missing"}, snapshot ${snapshot ? "present" : "missing"}, audit ${auditData ? "present" : "missing"}`,
      );
    }
    const parentDraft = draftProblem(parentPath, parent);
    if (parentDraft) throw new Error(parentDraft);
    const snapshotDraft = draftProblem(snapshotPath, snapshot);
    if (snapshotDraft) throw new Error(snapshotDraft);
    if (!sameDocument(parent, parentPlan.data)) {
      throw new Error(`rollback refused: ${parentPath} does not match the stored plan`);
    }
    const snapshotPlan = plans.find((plan) => plan.path === snapshotPath);
    if (!snapshotPlan || !sameDocument(snapshot, snapshotPlan.data)) {
      throw new Error(`rollback refused: ${snapshotPath} does not match the stored plan`);
    }
    const problem = auditProblem(auditData, { id, actor, objectId, parent, record });
    if (problem) throw new Error(`rollback refused: ${problem} ${audit}`);
    const collections = await db.doc(parentPath).listCollections();
    for (const collection of collections) {
      if (collection.id !== "versions") {
        throw new Error(`rollback refused: unexpected subcollection ${parentPath}/${collection.id}`);
      }
    }
    const versions = await db.collection(`${parentPath}/versions`).get();
    for (const version of versions.docs) {
      if (version.id !== CONTENT_VERSION) {
        throw new Error(`rollback refused: unexpected version ${version.ref.path}`);
      }
    }
    if (stage === "snapshots") {
      expected.set(snapshotPath, canonicalCatalogJson(snapshot));
      snapshotDeletes.push(snapshotPath);
      expected.set(parentPath, canonicalCatalogJson(parent));
      parentDeletes.push(parentPath);
    }
    if (stage === "parents") {
      throw new Error(`rollback refused: snapshot remains during parent stage ${snapshotPath}`);
    }
    retainedAudits += 1;
  }
  if (typeof claim.beforeDelete === "function") await claim.beforeDelete();
  for (const [docPath, checksum] of expected) {
    const current = await db.doc(docPath).get();
    const actual = current.exists ? canonicalCatalogJson(current.data()) : "";
    if (actual !== checksum || !current.exists || !current.updateTime) {
      throw new Error(`rollback refused: ${docPath} changed after verification`);
    }
  }
  if (stage === "snapshots") {
    await ref.update({ rollbackProgress: { stage: "snapshots", updatedAt: new Date().toISOString() } });
    if (snapshotDeletes.length > 0) {
      await deleteDocuments(db, {
        runId: id, plans, paths: snapshotDeletes, lockToken: token, expected, planSource: "trusted",
      });
    }
    stage = "parents";
    await ref.update({ rollbackProgress: { stage, updatedAt: new Date().toISOString() } });
  }
  if (stage === "parents") {
    if (parentDeletes.length > 0) {
      await deleteDocuments(db, {
        runId: id, plans, paths: parentDeletes, lockToken: token, expected, planSource: "trusted",
      });
    }
    stage = "mark";
    await ref.update({ rollbackProgress: { stage, updatedAt: new Date().toISOString() } });
  }
  const rolledBackAt = new Date().toISOString();
  const rollbackResult = {
    deletedParents: parentDeletes.length,
    deletedSnapshots: snapshotDeletes.length,
    retainedAudits,
  };
  await ref.update({
    status: "rolled_back",
    rolledBackAt,
    rollbackResult,
    rollbackProgress: { stage: "done", updatedAt: rolledBackAt },
  });
  await updateHeldLock(db, { runId: id, actor, token }, {
    status: "rolled_back",
    rolledBackAt,
    rollbackResult,
  });
  return { ...record, status: "rolled_back", rolledBackAt, rollbackResult };
}
