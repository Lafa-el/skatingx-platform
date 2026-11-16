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
  assertRunDocumentId,
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
// Each content batch also updates the migration ledger and the lock, so two slots stay free.
const MAX_OBJECTS_PER_BATCH = Math.floor((BATCH_LIMIT - 2) / DOCS_PER_OBJECT);
const BASE_CONTENT_DOCS = 514;

export function executionBudget(parentCount) {
  const parents = parentCount;
  const batches = parents === 0 ? 0 : Math.ceil(parents / MAX_OBJECTS_PER_BATCH);
  const content = parents * 2;
  const audits = parents;
  const migrationCreate = 1;
  const lockCreate = 1;
  const lockRelease = 1;
  const ledgerInBatch = batches;
  const lockFenceInBatch = batches;
  return content + audits + migrationCreate + lockCreate + lockRelease + ledgerInBatch + lockFenceInBatch;
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
  assertRunDocumentId(runId);
  return `${collectionPath(MIGRATIONS)}/${runId}`;
}

export const IMPORT_LOCK_ID = "__import_lock";

export function importLockPath() {
  return migrationPath(IMPORT_LOCK_ID);
}

export function auditDocId(runId, objectId) {
  assertRunDocumentId(runId);
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

export function tokenFingerprint(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function isRecoveryAuditPath(docPath, runId) {
  const prefix = `${collectionPath(AUDIT)}/lockrec-${runId}-`;
  if (typeof docPath !== "string" || !docPath.startsWith(prefix)) return false;
  return /^[a-f0-9]{16}$/.test(docPath.slice(prefix.length));
}

export function recoveryAuditProblem(data, { runId, actor, path }) {
  const expectedActor = actorOf({ actor });
  if (!data || typeof data !== "object") return "recovery audit is missing";
  if (data.action !== "lock-recovery" || data.result !== "ok" || data.runId !== runId || data.actor !== expectedActor) {
    return "recovery audit does not match the run";
  }
  if (!/^[a-f0-9]{64}$/.test(String(data.previousTokenFingerprint ?? "")) || !/^[a-f0-9]{64}$/.test(String(data.tokenFingerprint ?? ""))) {
    return "recovery audit token fingerprint is missing";
  }
  if (Object.hasOwn(data, "previousToken") || Object.hasOwn(data, "token")) return "recovery audit stores a raw token";
  if (typeof path === "string") {
    const suffix = path.split("/").pop() ?? "";
    if (suffix !== `lockrec-${runId}-${String(data.previousTokenFingerprint).slice(0, 16)}`) {
      return "recovery audit path does not match the token fingerprint";
    }
  }
  return "";
}

function lockMatches(lock, claim, purpose) {
  return Boolean(lock)
    && lock.status === "held"
    && lock.runId === claim.runId
    && lock.actor === claim.actor
    && lock.purpose === purpose
    && lock.token === claim.token;
}

function parentPathPattern() {
  return new RegExp(`^${collectionPath(OBJECTS)}/[^/]+$`);
}

function isParentPath(docPath) {
  return parentPathPattern().test(docPath);
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
    if (lock.runId !== claim.runId || lock.token !== claim.token || lock.actor !== claim.actor || lock.purpose !== "import") {
      throw new Error(`import refused: lock is not held by ${claim.runId}`);
    }
    if (lock.status === "held") return;
    if (lock.status === "released" || lock.status === "failed") {
      tx.update(ref, { status: "held", purpose: "import", acquiredAt: new Date().toISOString() });
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
    if (!lockMatches(lock, claim, "import")) {
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
    if (!lockMatches(lock, claim, "import")) return;
    tx.update(ref, {
      status: "failed",
      failedAt: new Date().toISOString(),
      failure: String(failure).slice(0, 500),
      lockFailureWrites: 1,
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
  const migration = await db.doc(migrationPath(runId)).get();
  if (!migration.exists) throw new Error(`migration ${runId} does not exist`);
  const actor = actorOf(migration.data());
  for (const docPath of [...unknown]) {
    if (!isRecoveryAuditPath(docPath, runId)) continue;
    const audit = await db.doc(docPath).get();
    if (recoveryAuditProblem(audit.data(), { runId, actor, path: docPath }) === "") {
      unknown.splice(unknown.indexOf(docPath), 1);
    }
  }
  if (unknown.length > 0) throw new Error(`resume refused: unknown catalog path ${unknown[0]}`);
  if (migration.data().status === "rolled_back") {
    throw new Error(`resume refused: run ${runId} is rolled_back`);
  }
  return migration.data();
}

export async function readOnlyClassification(db, plans, context) {
  const runId = requireText(context.runId, "runId");
  const importedAt = requireText(context.importedAt, "importedAt");
  const actor = requireText(context.actor ?? IMPORT_ACTOR, "actor");
  const serviceAccount = requireText(context.serviceAccount ?? "emulator", "serviceAccount");
  const operator = requireText(context.operator ?? actor, "operator");
  const objects = objectPlans(plans, runId, { actor, importedAt, serviceAccount, operator });
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
    plannedDocuments: absent * DOCS_PER_OBJECT,
    remainingObjectGroups: absent,
  };
}

export async function previewImport(db, plans, context) {
  assertWritableProject(db);
  return readOnlyClassification(db, plans, context);
}

async function recordProgress(db, migrationRef, fields, committedBatch, claim) {
  const lockRef = db.doc(importLockPath());
  const lockSnap = await lockRef.get();
  if (!lockSnap.exists || !lockMatches(lockSnap.data(), claim, "import")) {
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

function assertProductionHooks(projectId, context) {
  if (projectId !== PRODUCTION_PROJECT_ID) return;
  if (
    context.beforeBatch !== undefined
    || context.beforeDelete !== undefined
    || context.leaveLockHeld === true
    || context.stopAfterObjects !== undefined
    || context.crashAfterLock === true
  ) {
    throw new Error("refusing to run: test limits are not available for production");
  }
}

export async function executeImport(db, plans, context) {
  const writable = assertWritableProject(db);
  assertProductionHooks(writable.projectId, context);
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
    const storedRounds = (await migrationRef.get()).data()?.importRounds;
    const importRounds = Array.isArray(storedRounds) ? [...storedRounds] : [];
    for (let index = 0; index < work.length; index += MAX_OBJECTS_PER_BATCH) {
      const slice = work.slice(index, index + MAX_OBJECTS_PER_BATCH);
      const batchIndex = batches.length + 1;
      const paths = slice.flatMap((object) => object.docs.map((doc) => doc.path));
      await claimLock(db, claim);
      const lockSnap = await lockRef.get();
      const migrationSnap = await migrationRef.get();
      if (!lockSnap.exists || !lockMatches(lockSnap.data(), claim, "import") || !lockSnap.updateTime) {
        throw new Error(`import refused: lock is not held by ${runId}`);
      }
      if (!migrationSnap.exists || !migrationSnap.updateTime) {
        throw new Error("migration progress update failed: migration precondition is missing");
      }
      const lockTime = lockSnap.updateTime;
      if (typeof context.beforeBatch === "function") {
        await context.beforeBatch({ index: batchIndex, paths });
      }
      const nextContent = cumulativeContent + slice.length * 2;
      const nextAudits = cumulativeAudits + slice.length;
      const nextObjects = committedObjects + slice.length;
      const remainingAfterBatch = absent.length - nextObjects;
      const progress = {
        completedObjects: skippedExisting + nextObjects,
        remainingObjects: remainingAfterBatch,
      };
      const nextRounds = [...importRounds, { batch: batchIndex, content: slice.length * 2, audits: slice.length }];
      const roundContentWrites = nextContent - skippedExisting * 2;
      const roundAuditWrites = nextAudits - skippedExisting;
      const storedIds = Array.isArray(migrationSnap.data().committedObjectIds) ? migrationSnap.data().committedObjectIds : [];
      const committedObjectIds = [...storedIds, ...slice.map((object) => object.id)];
      const batch = db.batch();
      for (const object of slice) {
        for (const doc of object.docs) batch.create(db.doc(doc.path), documentData(doc.data));
      }
      batch.update(migrationRef, {
        status: remainingAfterBatch === 0 ? "completed" : "running",
        progress,
        completedObjects: progress.completedObjects,
        remainingObjects: progress.remainingObjects,
        cumulativeContentWrites: nextContent,
        cumulativeAuditWrites: nextAudits,
        roundContentWrites,
        roundAuditWrites,
        importRounds: nextRounds,
        committedObjectIds,
        lastCompletedBatch: batchIndex,
        updatedAt: new Date().toISOString(),
      }, { lastUpdateTime: migrationSnap.updateTime });
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
      cumulativeContent = nextContent;
      cumulativeAudits = nextAudits;
      committedObjects = nextObjects;
      importRounds.splice(0, importRounds.length, ...nextRounds);
      const entry = {
        index: batchIndex,
        objects: slice.length,
        writes: slice.length * DOCS_PER_OBJECT,
        cumulativeContent,
        cumulativeAudits,
      };
      batches.push(entry);
      console.error(batchLine(entry));
    }
    const remainingPlanned = absent.length - work.length;
    const runStatus = remainingPlanned === 0 ? "completed" : "running";
    let controlWrites = batches.length * 2;
    let migrationDocumentWrites = batches.length;
    let lockDocumentWrites = batches.length;
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
        controlWrites += 2;
        migrationDocumentWrites += 1;
        lockDocumentWrites += 1;
      }
    }
    await updateHeldLock(db, claim, { status: "released", purpose: "import", releasedAt: new Date().toISOString() });
    controlWrites += 1;
    lockDocumentWrites += 1;
    return {
      plannedContentWrites: absent.length * 2,
      plannedAuditWrites: absent.length,
      plannedMigrationCreates: 0,
      actualContentWrites: work.length * 2,
      actualAuditWrites: work.length,
      actualMigrationWrites: migrationDocumentWrites,
      migrationDocumentWrites,
      lockDocumentWrites,
      controlWrites,
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
      if (stored.status === "rolling_back" || lock.purpose === "rollback") {
        throw new Error(`resume refused: run ${runId} is rolling back`);
      }
      const actor = actorOf(stored);
      if (requestedActor !== "" && requestedActor !== actor) {
        throw new Error(`actor mismatch: expected ${actor}`);
      }
      if (stored.workbookSha256 !== workbookSha256) {
        throw new Error(`resume refused: workbookSha256 expected ${stored.workbookSha256}`);
      }
      if (lock.purpose !== "import") throw new Error(`resume refused: run ${runId} is rolling back`);
      return { ...stored, created: false, lockToken: suppliedToken, lockWrites: 0 };
    }
    if (lock?.status === "held" && lock.purpose === "rollback" && lock.runId === runId) {
      throw new Error(`resume refused: run ${runId} is rolling back`);
    }
    if (lock?.status === "held") throw new Error(`import lock is held by ${lock.runId}`);
    if (lock && lock.runId !== runId && lock.status !== "released" && lock.status !== "rolled_back") {
      throw new Error(`import lock belongs to ${lock.runId}`);
    }
    if (lock?.status === "recovered" && snap.exists && input.initial !== true && lock.runId === runId) {
      const stored = snap.data();
      if (stored.status === "rolled_back") throw new Error(`resume refused: run ${runId} is rolled_back`);
      if (stored.status === "rolling_back" || lock.purpose === "rollback") {
        throw new Error(`resume refused: run ${runId} is rolling back`);
      }
      const actor = actorOf(stored);
      if (requestedActor !== "" && requestedActor !== actor) throw new Error(`actor mismatch: expected ${actor}`);
      if (lock.actor !== actor) throw new Error("lock recovery refused: actor mismatch");
      if (stored.recoveredLockToken !== lock.token) {
        throw new Error("resume refused: recovered token does not match the migration");
      }
      tx.update(lockRef, { status: "held", purpose: "import", adoptedAt: new Date().toISOString() });
      return { ...stored, created: false, lockToken: lock.token, lockWrites: 1 };
    }
    if (!snap.exists && input.initial === true) await assertCatalogEmptyForInitial(tx, db);
    if (snap.exists) {
      const stored = snap.data();
      if (stored.status === "rolled_back") throw new Error(`resume refused: run ${runId} is rolled_back`);
      if (stored.status === "rolling_back" || lock?.purpose === "rollback") {
        throw new Error(`resume refused: run ${runId} is rolling back`);
      }
      const actor = actorOf(stored);
      if (requestedActor !== "" && requestedActor !== actor) {
        throw new Error(`actor mismatch: expected ${actor}`);
      }
      const token = newLockToken();
      tx.set(lockRef, {
        runId,
        actor,
        purpose: "import",
        acquiredAt: new Date().toISOString(),
        status: "held",
        token,
        previousToken: lock?.token ?? null,
        previousStatus: lock?.status ?? "absent",
      });
      return { ...stored, created: false, lockToken: token, lockWrites: 1 };
    }
    if (input.initial !== true) throw new Error(`resume refused: migration ${runId} does not exist`);
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
      purpose: "import",
      acquiredAt: importedAt,
      status: "held",
      token,
      previousToken: lock?.token ?? null,
      previousStatus: lock?.status ?? "absent",
    });
    return { ...record, created: true, lockToken: token, lockWrites: 1 };
  });
}

async function assertRecoverableContent(db, record) {
  const { plans } = loadPlans(record.importedAt);
  const parents = plans.filter((plan) => isParentPath(plan.path));
  const extra = parents.map((plan) => ({ path: auditPath(record.runId, plan.data.id) }));
  const stored = await readPlannedDocs(db, [...plans, ...extra], readModeOf(db));
  for (const plan of parents) {
    const parent = stored.get(plan.path);
    const snapshotPath = `${plan.path}/versions/${CONTENT_VERSION}`;
    const snapshot = stored.get(snapshotPath);
    const snapshotPlan = plans.find((item) => item.path === snapshotPath);
    const audit = stored.get(auditPath(record.runId, plan.data.id));
    if (!parent && !snapshot && !audit) continue;
    if (record.status === "rolling_back") {
      if (parent && !sameDocument(parent, plan.data)) throw new Error(`lock recovery refused: content conflict ${plan.path}`);
      if (snapshot && snapshotPlan && !sameDocument(snapshot, snapshotPlan.data)) {
        throw new Error(`lock recovery refused: content conflict ${snapshotPath}`);
      }
      if ((parent && !audit) || (snapshot && !parent)) {
        throw new Error(`lock recovery refused: incomplete object ${plan.data.id}`);
      }
      if (audit) {
        const rollingProblem = auditProblem(audit, { id: record.runId, actor: actorOf(record), objectId: plan.data.id, parent: parent ?? plan.data, record });
        if (rollingProblem) throw new Error(`lock recovery refused: ${rollingProblem} ${plan.data.id}`);
      }
      continue;
    }
    if (!parent || !snapshot || !snapshotPlan) throw new Error(`lock recovery refused: incomplete object ${plan.data.id}`);
    if (!sameDocument(parent, plan.data)) throw new Error(`lock recovery refused: content conflict ${plan.path}`);
    if (!sameDocument(snapshot, snapshotPlan.data)) throw new Error(`lock recovery refused: content conflict ${snapshotPath}`);
    const problem = auditProblem(audit, { id: record.runId, actor: actorOf(record), objectId: plan.data.id, parent, record });
    if (problem) throw new Error(`lock recovery refused: ${problem} ${plan.data.id}`);
  }
}

export async function recoverImportLock(db, input) {
  const writable = assertWritableProject(db);
  if (input.confirmHolderDead !== true) {
    throw new Error("lock recovery refused: holder has not been confirmed dead");
  }
  const runId = requireText(input.runId, "runId");
  assertRunDocumentId(runId);
  const actor = requireText(input.actor, "actor");
  const reason = requireText(input.reason, "reason");
  const migrationRef = db.doc(migrationPath(runId));
  const migrationSnap = await migrationRef.get();
  if (!migrationSnap.exists) throw new Error(`lock recovery refused: migration ${runId} does not exist`);
  const record = migrationSnap.data();
  if (record.status === "rolled_back") {
    throw new Error(`lock recovery refused: run ${runId} is rolled_back`);
  }
  const confirmedFingerprint = requireText(input.confirmedTokenFingerprint, "confirmedTokenFingerprint");
  if (typeof input.confirmedUpdateTimeMillis !== "number") {
    throw new Error("lock recovery refused: confirmed lock version is missing");
  }
  await assertRecoverableContent(db, record);
  const lockRef = db.doc(importLockPath());
  const token = newLockToken();
  const recoveredAt = new Date().toISOString();
  let previousToken = "";
  let purpose = "import";
  let migrationStatus = record.status;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const migration = await tx.get(migrationRef);
    if (!snap.exists || snap.data().status !== "held") {
      throw new Error("lock recovery refused: there is no active holder");
    }
    if (!migration.exists) throw new Error(`lock recovery refused: migration ${runId} does not exist`);
    const storedMigration = migration.data();
    if (storedMigration.status === "rolled_back") {
      throw new Error(`lock recovery refused: run ${runId} is rolled_back`);
    }
    const lock = snap.data();
    if (lock.runId !== runId) throw new Error(`lock recovery refused: lock belongs to ${lock.runId}`);
    if (lock.actor !== actor) throw new Error("lock recovery refused: actor mismatch");
    if (lock.purpose !== "import" && lock.purpose !== "rollback") {
      throw new Error("lock recovery refused: lock purpose is not recognized");
    }
    if (tokenFingerprint(String(lock.token ?? "")) !== confirmedFingerprint || !snap.updateTime || snap.updateTime.toMillis() !== input.confirmedUpdateTimeMillis) {
      throw new Error("lock recovery refused: lock version changed after confirmation");
    }
    previousToken = lock.token;
    purpose = lock.purpose;
    migrationStatus = storedMigration.status;
    const previousFingerprint = tokenFingerprint(previousToken);
    const nextFingerprint = tokenFingerprint(token);
    const auditId = `lockrec-${runId}-${previousFingerprint.slice(0, 16)}`;
    tx.set(lockRef, {
      ...lock,
      token,
      previousToken,
      previousStatus: lock.status,
      recoveredAt,
      recovery: "manual",
      recoveryReason: reason,
      purpose,
      status: "recovered",
    });
    tx.update(migrationRef, {
      recoveredLockToken: token,
      lockRecoveredAt: recoveredAt,
      recoveryControlWrites: Number(storedMigration.recoveryControlWrites ?? 0) + 3,
    });
    tx.create(db.doc(`${collectionPath(AUDIT)}/${auditId}`), {
      action: "lock-recovery",
      runId,
      actor,
      operator: actor,
      serviceAccount: writable.serviceAccount,
      previousTokenFingerprint: previousFingerprint,
      tokenFingerprint: nextFingerprint,
      at: recoveredAt,
      reason,
      result: "ok",
    });
  });
  return { runId, actor, lockToken: token, previousToken, recoveredAt, reason, purpose, migrationStatus, lockStatus: "recovered" };
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

async function assertDescendants(db, parentPath) {
  const collections = await db.doc(parentPath).listCollections();
  for (const collection of collections) {
    if (collection.id !== "versions") {
      throw new Error(`rollback refused: unexpected subcollection ${parentPath}/${collection.id}`);
    }
  }
  const versionRefs = await db.collection(`${parentPath}/versions`).listDocuments();
  for (const versionRef of versionRefs) {
    const version = await versionRef.get();
    if (!version.exists) {
      throw new Error(`rollback refused: ghost version ${versionRef.path}`);
    }
    if (version.id !== CONTENT_VERSION) {
      throw new Error(`rollback refused: unexpected version ${versionRef.path}`);
    }
  }
  const versionPath = `${parentPath}/versions/${CONTENT_VERSION}`;
  const nested = await db.doc(versionPath).listCollections();
  for (const collection of nested) {
    throw new Error(`rollback refused: unexpected subcollection ${versionPath}/${collection.id}`);
  }
}

const issuedRollbackTokens = new Set();

async function acquireRollbackLock(db, { runId, actor, memoryToken, migrationRef, objectSet }) {
  const lockRef = db.doc(importLockPath());
  const freshToken = newLockToken();
  let activeToken = freshToken;
  let acquired = false;
  let controlUpdates = 0;
  await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef);
    const migrationSnap = await tx.get(migrationRef);
    if (!lockSnap.exists) throw new Error(`rollback refused: lock is not held by ${runId}`);
    const lock = lockSnap.data();
    if (lock.runId !== runId) throw new Error(`rollback refused: lock belongs to ${lock.runId}`);
    if (lock.actor !== actor) throw new Error("rollback refused: actor mismatch");
    if (!migrationSnap.exists) throw new Error(`migration ${runId} does not exist`);
    const migration = migrationSnap.data();
    const ids = Array.isArray(migration.committedObjectIds) ? migration.committedObjectIds : [];
    if (ids.join("\n") !== objectSet) throw new Error("rollback refused: confirmed object set changed");
    if (migration.status === "rolled_back") throw new Error(`rollback refused: run ${runId} is rolled_back`);
    if (lock.purpose === "rollback" && memoryToken && lock.token !== memoryToken) {
      throw new Error("rollback refused: rollback holder must be recovered explicitly");
    }
    if (lock.status === "held" && lock.purpose === "rollback" && memoryToken && issuedRollbackTokens.has(memoryToken) && lock.token === memoryToken) {
      if (migration.status !== "rolling_back") throw new Error("rollback refused: migration is not rolling back");
      activeToken = memoryToken;
      controlUpdates = Number(migration.rollbackResult?.controlUpdates ?? 0);
      return;
    }
    if (lock.status === "held" && lock.purpose === "rollback") {
      throw new Error("rollback refused: rollback holder must be recovered explicitly");
    }
    if (lock.status === "held") throw new Error("rollback refused: import is still running");
    if (lock.status !== "released" && lock.status !== "failed" && lock.status !== "recovered") {
      throw new Error(`rollback refused: lock is ${lock.status}`);
    }
    if (lock.status === "recovered" && lock.purpose === "rollback" && migration.status !== "rolling_back") {
      throw new Error("rollback refused: migration is not rolling back");
    }
    if ((lock.status === "released" || lock.status === "failed") && migration.status === "rolling_back") {
      throw new Error("rollback refused: migration stage does not match the lock");
    }
    acquired = true;
    const now = new Date().toISOString();
    const priorUpdates = Number(migration.rollbackResult?.controlUpdates ?? 0);
    controlUpdates = priorUpdates + 2;
    tx.update(lockRef, {
      status: "held",
      purpose: "rollback",
      token: freshToken,
      previousToken: lock.token,
      acquiredAt: now,
    });
    tx.update(migrationRef, {
      status: "rolling_back",
      rollbackStartedAt: migration.rollbackStartedAt ?? now,
      rollbackResult: { ...(migration.rollbackResult ?? {}), controlUpdates },
    });
  });
  if (acquired) issuedRollbackTokens.add(activeToken);
  return { token: activeToken, acquired, controlUpdates };
}

const ROLLBACK_STAGES = ["snapshots", "parents", "mark", "done"];

function assertRollbackStage(currentStage, expectedStage, nextStage) {
  const current = currentStage ?? "snapshots";
  if (current !== expectedStage) throw new Error("rollback refused: migration stage moved after verification");
  const currentIndex = ROLLBACK_STAGES.indexOf(current);
  const nextIndex = ROLLBACK_STAGES.indexOf(nextStage);
  if (currentIndex < 0 || nextIndex < 0 || nextIndex < currentIndex || nextIndex > currentIndex + 1) {
    throw new Error("rollback refused: migration stage moved after verification");
  }
}

async function commitRollbackBatch(db, { runId, token, actor, migrationRef, deletes, verified, auditPaths = [], auditVersions, migrationPatch, expectedStage, lockPatch = {} }) {
  const lockRef = db.doc(importLockPath());
  const nextStage = migrationPatch.rollbackProgress?.stage;
  try {
    await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      const migrationSnap = await tx.get(migrationRef);
      const deleteSnaps = [];
      for (const docPath of deletes) {
        deleteSnaps.push([docPath, await tx.get(db.doc(docPath))]);
      }
      const parentSnaps = new Map();
      for (const docPath of deletes) {
        if (!docPath.endsWith(`/versions/${CONTENT_VERSION}`)) continue;
        const parentPath = docPath.slice(0, -`/versions/${CONTENT_VERSION}`.length);
        if (!parentSnaps.has(parentPath)) parentSnaps.set(parentPath, await tx.get(db.doc(parentPath)));
      }
      const auditSnaps = [];
      for (const docPath of auditPaths) auditSnaps.push([docPath, await tx.get(db.doc(docPath))]);
      const lock = lockSnap.exists ? lockSnap.data() : null;
      if (!lockSnap.exists || !lockMatches(lock, { runId, actor, token }, "rollback")) {
        throw new Error(`rollback refused: lock is not held by ${runId}`);
      }
      if (!migrationSnap.exists) throw new Error("rollback refused: migration precondition is missing");
      assertRollbackStage(migrationSnap.data().rollbackProgress?.stage, expectedStage, nextStage);
      for (const [docPath, snap] of deleteSnaps) {
        const saved = verified?.get(docPath);
        const actual = snap.exists ? canonicalCatalogJson(snap.data()) : "";
        if (!saved?.updateTime || !snap.exists || !snap.updateTime || actual !== saved.checksum || snap.updateTime.toMillis() !== saved.updateTime.toMillis()) {
          throw new Error(`rollback refused: ${docPath} changed after verification`);
        }
      }
      for (const [parentPath, snap] of parentSnaps) {
        const saved = verified?.get(parentPath);
        const actual = snap.exists ? canonicalCatalogJson(snap.data()) : "";
        if (!saved?.updateTime || !snap.exists || !snap.updateTime || actual !== saved.checksum || snap.updateTime.toMillis() !== saved.updateTime.toMillis()) {
          throw new Error(`rollback refused: ${parentPath} changed after verification`);
        }
      }
      for (const [docPath, snap] of auditSnaps) {
        const savedTime = auditVersions?.get(docPath);
        if (!snap.exists || !snap.updateTime || !savedTime || snap.updateTime.toMillis() !== savedTime.toMillis() || snap.data()?.result !== "ok" || snap.data()?.runId !== runId) {
          throw new Error(`rollback refused: ${docPath} changed after verification`);
        }
      }
      for (const docPath of deletes) tx.delete(db.doc(docPath));
      const now = new Date().toISOString();
      tx.update(migrationRef, { ...migrationPatch, updatedAt: now });
      tx.update(lockRef, { lastRollbackAt: now, ...lockPatch });
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.startsWith("rollback refused:")) throw error;
    throw new Error(`rollback refused: commit failed: ${reason}`, { cause: error });
  }
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
  const writable = assertWritableProject(db);
  assertProductionHooks(writable.projectId, claim);
  const id = requireText(runId, "runId");
  const memoryToken = typeof claim.memoryToken === "string"
    ? claim.memoryToken
    : (typeof claim.lockToken === "string" ? claim.lockToken : "");
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
      await assertDescendants(db, parentPath);
      const committed = new Set(Array.isArray(record.committedObjectIds) ? record.committedObjectIds : []);
      if (committed.has(objectId)) {
        throw new Error(`rollback refused: imported object ${objectId} is missing its audit`);
      }
      continue;
    }
    const snapshotGone = parent && auditData && !snapshot;
    const contentGone = !parent && !snapshot && auditData;
    if (stage === "mark" || ((stage === "parents" || stage === "mark") && contentGone)) {
      if (parent || snapshot) {
        throw new Error(`rollback refused: ${objectId} still has content during the ${stage} stage`);
      }
      if (!auditData) throw new Error(`rollback refused: audit missing ${audit}`);
      const problem = auditProblem(auditData, { id, actor, objectId, parent: parentPlan.data, record });
      if (problem) throw new Error(`rollback refused: ${problem} ${audit}`);
      await assertDescendants(db, parentPath);
      const versions = await db.collection(`${parentPath}/versions`).get();
      if (!versions.empty) throw new Error(`rollback refused: ${objectId} still has content during the ${stage} stage`);
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
      await assertDescendants(db, parentPath);
      expected.set(parentPath, canonicalCatalogJson(parent));
      parentDeletes.push({ path: parentPath, audit });
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
    await assertDescendants(db, parentPath);
    if (stage === "snapshots") {
      expected.set(snapshotPath, canonicalCatalogJson(snapshot));
      snapshotDeletes.push({ path: snapshotPath, audit });
      expected.set(parentPath, canonicalCatalogJson(parent));
      parentDeletes.push({ path: parentPath, audit });
    }
    if (stage === "parents") {
      throw new Error(`rollback refused: snapshot remains during parent stage ${snapshotPath}`);
    }
    retainedAudits += 1;
  }
  const verified = new Map();
  for (const [docPath, checksum] of expected) {
    const current = await db.doc(docPath).get();
    const actual = current.exists ? canonicalCatalogJson(current.data()) : "";
    if (actual !== checksum || !current.exists || !current.updateTime) {
      throw new Error(`rollback refused: ${docPath} changed after verification`);
    }
    verified.set(docPath, { checksum, updateTime: current.updateTime });
  }
  const auditVersions = new Map();
  for (const auditPath of [...new Set([...snapshotDeletes, ...parentDeletes].map((item) => item.audit))]) {
    const current = await db.doc(auditPath).get();
    if (!current.exists || !current.updateTime || current.data()?.result !== "ok" || current.data()?.runId !== id) {
      throw new Error(`rollback refused: ${auditPath} changed after verification`);
    }
    auditVersions.set(auditPath, current.updateTime);
  }
  if (typeof claim.beforeDelete === "function") await claim.beforeDelete();
  const objectSet = (Array.isArray(fresh.data().committedObjectIds) ? fresh.data().committedObjectIds : []).join("\n");
  const ownership = await acquireRollbackLock(db, {
    runId: id,
    actor,
    memoryToken,
    migrationRef: ref,
    objectSet,
  });
  const token = ownership.token;
  if (typeof claim.onLockToken === "function") claim.onLockToken(token);
  if (claim.crashAfterLock === true) throw new Error("injected rollback holder crash");
  const prior = fresh.data().rollbackResult ?? {};
  let deletedSnapshots = prior.deletedSnapshots ?? 0;
  let deletedParents = prior.deletedParents ?? 0;
  let controlUpdates = ownership.controlUpdates;
  const chunk = 200;
  function operationCounts() {
    const totalOperations = deletedParents + deletedSnapshots + controlUpdates;
    return { deletedParents, deletedSnapshots, retainedAudits, controlUpdates, controlWrites: totalOperations, totalOperations };
  }
  async function commitChunks(items, kind, expectedStage) {
    for (let index = 0; index < items.length; index += chunk) {
      const slice = items.slice(index, index + chunk);
      if (kind === "snapshots") deletedSnapshots += slice.length;
      else deletedParents += slice.length;
      controlUpdates += 2;
      await commitRollbackBatch(db, {
        runId: id,
        actor,
        token,
        migrationRef: ref,
        deletes: slice.map((item) => item.path),
        verified,
        auditPaths: [...new Set(slice.map((item) => item.audit))],
        auditVersions,
        expectedStage,
        migrationPatch: {
          status: "rolling_back",
          rollbackProgress: { stage: expectedStage, updatedAt: new Date().toISOString() },
          rollbackResult: operationCounts(),
        },
      });
    }
  }
  if (stage === "snapshots") {
    await commitChunks(snapshotDeletes, "snapshots", "snapshots");
    stage = "parents";
    controlUpdates += 2;
    await commitRollbackBatch(db, {
      runId: id,
      actor,
      token,
      migrationRef: ref,
      deletes: [],
      auditPaths: [],
      auditVersions,
      expectedStage: "snapshots",
      migrationPatch: {
        status: "rolling_back",
        rollbackProgress: { stage, updatedAt: new Date().toISOString() },
        rollbackResult: operationCounts(),
      },
    });
  }
  if (stage === "parents") {
    await commitChunks(parentDeletes, "parents", "parents");
    stage = "mark";
    controlUpdates += 2;
    await commitRollbackBatch(db, {
      runId: id,
      actor,
      token,
      migrationRef: ref,
      deletes: [],
      auditPaths: [],
      auditVersions,
      expectedStage: "parents",
      migrationPatch: {
        status: "rolling_back",
        rollbackProgress: { stage, updatedAt: new Date().toISOString() },
        rollbackResult: operationCounts(),
      },
    });
  }
  const rolledBackAt = new Date().toISOString();
  controlUpdates += 2;
  const rollbackResult = operationCounts();
  await commitRollbackBatch(db, {
    runId: id,
    actor,
    token,
    migrationRef: ref,
    deletes: [],
    auditPaths: [],
    auditVersions,
    expectedStage: "mark",
    migrationPatch: {
      status: "rolled_back",
      rolledBackAt,
      rollbackResult,
      rollbackProgress: { stage: "done", updatedAt: rolledBackAt },
    },
    lockPatch: { status: "rolled_back", rolledBackAt, rollbackResult },
  });
  return { ...record, status: "rolled_back", rolledBackAt, rollbackResult, lockToken: token };
}
