// Shared catalog import core. Emulator only: the project id must start with demo-.
//
// F01: every read, write, check, and rollback touches only the planned catalog
// paths (one parent and one snapshot per object) plus the audit and migration
// documents for this runId. There is no collection-group query.
// F02: beginRun stores one migration record per runId, including the importedAt
// used to build documents. A later process with the same runId reuses that
// record and rebuilds the same documents. Matching documents are not written.
// A stored document that differs from the plan throws the path and the expected
// and actual checksums, and is never overwritten.
// F03: initial import checks an empty catalog before creating a run. Resume
// rebuilds documents from the stored importedAt and actor, writes only fully
// missing object groups, and refuses partial groups or content drift.
// F04: rollback deletes parent and snapshot documents only. Import audit records
// stay. The migration status becomes rolled_back and rolledBackAt is set.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
export const BASE_IMPORT_BUDGET = 772;
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

function assertDemoProject(db) {
  assertDemoProjectId(projectIdOf(db));
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

export async function readPlannedDocs(db, plans) {
  assertDemoProject(db);
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
  return allowed;
}

export async function preflightInitial(db, plans) {
  assertDemoProject(db);
  if (plans.length !== BASE_CONTENT_DOCS) {
    throw new Error(`initial refused: planned content paths ${plans.length} expected ${BASE_CONTENT_DOCS}`);
  }
  const summary = planSummary(plans);
  const budget = summary.parents + summary.versions + summary.audits + 1;
  if (summary.parents !== 257 || budget !== BASE_IMPORT_BUDGET) {
    throw new Error(`initial refused: write budget ${budget} expected ${BASE_IMPORT_BUDGET}`);
  }
  const inspected = await inspectCatalog(db);
  if (inspected.orphans.length > 0) {
    throw new Error(`initial refused: orphan catalog path ${inspected.orphans[0]}`);
  }
  for (const [name, paths] of inspected.collectionDocs) {
    if (paths.length > 0) throw new Error(`initial refused: ${name} is not empty (${paths[0]})`);
  }
  const existing = await readPlannedDocs(db, plans);
  if (existing.size > 0) {
    throw new Error(`initial refused: planned path already exists ${existing.keys().next().value}`);
  }
  return { planSummary: summary, baseBudget: budget, plannedMigrationCreates: 1 };
}

export async function assertResumeCatalog(db, plans, runId) {
  assertDemoProject(db);
  const allowed = allowedPaths(plans, runId);
  const inspected = await inspectCatalog(db);
  const unknown = [...inspected.orphans];
  for (const paths of inspected.collectionDocs.values()) {
    for (const docPath of paths) {
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
  assertDemoProject(db);
  const runId = requireText(context.runId, "runId");
  const importedAt = requireText(context.importedAt, "importedAt");
  const actor = requireText(context.actor ?? IMPORT_ACTOR, "actor");
  const objects = objectPlans(plans, runId, { actor, importedAt });
  const existing = await readPlannedDocs(
    db,
    objects.flatMap((object) => object.docs),
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

export async function executeImport(db, plans, context) {
  assertDemoProject(db);
  const runId = requireText(context.runId, "runId");
  const importedAt = requireText(context.importedAt, "importedAt");
  const actor = requireText(context.actor ?? IMPORT_ACTOR, "actor");
  const objects = objectPlans(plans, runId, { actor, importedAt });
  const existing = await readPlannedDocs(
    db,
    objects.flatMap((object) => object.docs),
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
  let cumulativeContent = 0;
  let cumulativeAudits = 0;
  for (let index = 0; index < work.length; index += MAX_OBJECTS_PER_BATCH) {
    const slice = work.slice(index, index + MAX_OBJECTS_PER_BATCH);
    const batch = db.batch();
    for (const object of slice) {
      for (const doc of object.docs) batch.set(db.doc(doc.path), documentData(doc.data));
    }
    await batch.commit();
    cumulativeContent += slice.length * 2;
    cumulativeAudits += slice.length;
    batches.push({
      index: batches.length + 1,
      objects: slice.length,
      writes: slice.length * DOCS_PER_OBJECT,
      cumulativeContent,
      cumulativeAudits,
    });
  }
  const remainingPlanned = absent.length - work.length;
  const runStatus = remainingPlanned === 0 ? "completed" : "running";
  let actualMigrationWrites = 0;
  const migrationRef = db.doc(migrationPath(runId));
  const migrationSnap = await migrationRef.get();
  if (migrationSnap.exists) {
    const current = migrationSnap.data();
    const progress = { completedObjects: skippedExisting + work.length, remainingObjects: remainingPlanned };
    const sameProgress =
      current.status === runStatus &&
      current.progress?.completedObjects === progress.completedObjects &&
      current.progress?.remainingObjects === progress.remainingObjects;
    if (!sameProgress) {
      await migrationRef.update({ status: runStatus, progress, updatedAt: new Date().toISOString() });
      actualMigrationWrites += 1;
    }
  }
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
}

export async function importDocuments(db, plans, context) {
  const report = await executeImport(db, plans, context);
  return report.actualContentWrites;
}

export async function deleteDocuments(db, docPaths) {
  assertDemoProject(db);
  const versions = docPaths.filter((docPath) => docPath.includes("/versions/"));
  const parents = docPaths.filter((docPath) => !docPath.includes("/versions/"));
  for (const group of [versions, parents]) {
    for (let index = 0; index < group.length; index += BATCH_LIMIT) {
      const batch = db.batch();
      for (const docPath of group.slice(index, index + BATCH_LIMIT)) batch.delete(db.doc(docPath));
      await batch.commit();
    }
  }
}

export async function beginRun(db, input) {
  assertDemoProject(db);
  const runId = requireText(input.runId, "runId");
  const workbookSha256 = requireText(input.workbookSha256, "workbookSha256");
  if (workbookSha256 !== EXPECTED_WORKBOOK_SHA256) {
    throw new Error(`workbookSha256 mismatch: ${workbookSha256}`);
  }
  const requestedActor = typeof input.actor === "string" ? input.actor.trim() : "";
  const importedAt = new Date().toISOString();
  const summary = planSummary(loadPlans(importedAt).plans);
  const ref = db.doc(migrationPath(runId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const stored = snap.data();
      if (requestedActor !== "" && requestedActor !== actorOf(stored)) {
        throw new Error(`actor mismatch: expected ${actorOf(stored)}`);
      }
      return { ...stored, created: false };
    }
    const record = {
      runId,
      actor: requestedActor !== "" ? requestedActor : IMPORT_ACTOR,
      importedAt,
      workbookSha256,
      projectId: projectIdOf(db),
      databaseId: databaseIdOf(db),
      planSummary: summary,
      progress: { completedObjects: 0, remainingObjects: summary.parents },
      status: "running",
    };
    if (typeof input.gitSha === "string" && input.gitSha.trim() !== "") record.gitSha = input.gitSha.trim();
    tx.set(ref, record);
    return { ...record, created: true };
  });
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

export async function rollbackImport(db, runId) {
  assertDemoProject(db);
  const id = requireText(runId, "runId");
  const ref = db.doc(migrationPath(id));
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`migration ${id} does not exist`);
  const record = snap.data();
  const { plans } = loadPlans(record.importedAt);
  await deleteDocuments(db, plans.map((plan) => plan.path));
  const rolledBackAt = new Date().toISOString();
  await ref.update({ status: "rolled_back", rolledBackAt });
  return { ...record, status: "rolled_back", rolledBackAt };
}
