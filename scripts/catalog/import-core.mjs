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
// F04: rollback deletes parent and snapshot documents only. Import audit records
// stay. The migration status becomes rolled_back and rolledBackAt is set.
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
const ROOT = "artifacts/skatingx-production";
const OBJECTS = "trainingCatalogObjects";
const AUDIT = "trainingCatalogAuditLogs";
const MIGRATIONS = "trainingCatalogMigrations";

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

function projectIdOf(db) {
  const settings = db._settings;
  if (settings && typeof settings.projectId === "string" && settings.projectId !== "") {
    return settings.projectId;
  }
  return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
}

function assertDemoProject(db) {
  assertDemoProjectId(projectIdOf(db));
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

export async function importDocuments(db, plans, context) {
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
  const pending = [];
  let written = 0;
  for (const object of objects) {
    let missingContent = 0;
    for (const doc of object.docs) {
      const current = existing.get(doc.path);
      if (current === undefined) {
        if (!doc.path.includes(`/${AUDIT}/`)) missingContent += 1;
        continue;
      }
      if (!sameDocument(current, doc.data)) {
        mismatches.push(
          `${doc.path} expected checksum ${checksumField(documentData(doc.data))} actual checksum ${checksumField(current)}`,
        );
      }
    }
    if (missingContent > 0 || object.docs.some((doc) => existing.get(doc.path) === undefined)) {
      pending.push(object);
      written += missingContent;
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`import refused: ${mismatches.join("; ")}`);
  }
  for (let index = 0; index < pending.length; index += MAX_OBJECTS_PER_BATCH) {
    const batch = db.batch();
    for (const object of pending.slice(index, index + MAX_OBJECTS_PER_BATCH)) {
      for (const doc of object.docs) batch.set(db.doc(doc.path), documentData(doc.data));
    }
    await batch.commit();
  }
  return written;
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
  const importedAt = new Date().toISOString();
  const ref = db.doc(migrationPath(runId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data();
    const record = {
      runId,
      projectId: projectIdOf(db),
      workbookSha256,
      importedAt,
      status: "running",
    };
    tx.set(ref, record);
    return record;
  });
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
