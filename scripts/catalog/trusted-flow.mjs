// Trusted catalog review and publish. Admin SDK only.
//
// Run against the Firestore emulator. A project id that does not start with
// demo- is refused. This file is also the CLI; importing it does not run a command.
import { pathToFileURL } from "node:url";
import path from "node:path";

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import {
  contentChecksumPayload,
  publishCatalogVersion,
  revokeCatalogApproval,
} from "../../packages/training-catalog/src/catalog-object.ts";
import { checkPublishedBinding } from "../../packages/training-catalog/src/validate.ts";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum.ts";

const ROOT = "artifacts/skatingx-production";
const OBJECTS = "trainingCatalogObjects";
const RELEASES = "trainingCatalogReleases";
const LINKS = "trainingCatalogLinks";
const PUBLIC_LINKS = "trainingCatalogPublicLinks";
const AUDIT = "trainingCatalogAuditLogs";
const EDITOR_ACTIONS = new Set(["create", "edit", "import"]);

function collectionPath(name) {
  return `${ROOT}/${name}`;
}

function objectPath(objectId) {
  return `${collectionPath(OBJECTS)}/${objectId}`;
}

function versionPath(objectId, contentVersion) {
  return `${objectPath(objectId)}/versions/${contentVersion}`;
}

function releaseDocId(objectId, contentVersion) {
  return `rel-${objectId}-${contentVersion}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function assertCatalogProject(projectId) {
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
  assertCatalogProject(projectIdOf(db));
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function isTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function readDoc(db, docPath) {
  const snap = await db.doc(docPath).get();
  return snap.exists ? snap.data() : null;
}

function recomputeChecksum(snapshot) {
  const input = {
    localeContent: snapshot.localeContent,
    taxonomy: snapshot.taxonomy,
    refs: snapshot.refs,
    legacyAttributes: snapshot.legacyAttributes,
    schemaVersion: snapshot.schemaVersion,
  };
  if (snapshot.supersedesVersion !== undefined) input.supersedesVersion = snapshot.supersedesVersion;
  return computeCatalogChecksum(contentChecksumPayload(input));
}

async function lastEditor(db, objectId) {
  const snap = await db.collection(collectionPath(AUDIT)).where("target.id", "==", objectId).get();
  let latest = null;
  for (const item of snap.docs) {
    const data = item.data();
    if (!EDITOR_ACTIONS.has(data.action)) continue;
    if (data.target?.collection !== OBJECTS) continue;
    if (typeof data.actor !== "string" || data.actor.trim() === "") continue;
    if (latest === null || String(data.at) > String(latest.at)) latest = data;
  }
  return latest === null ? null : latest.actor.trim();
}

async function writeAudit(db, entry) {
  const ref = db.collection(collectionPath(AUDIT)).doc();
  await ref.set(entry);
  return ref.id;
}

async function reject(db, action, actor, target, error) {
  const reason = error instanceof Error ? error.message : String(error);
  await writeAudit(db, {
    action,
    actor: typeof actor === "string" && actor.trim() !== "" ? actor.trim() : "(missing)",
    target,
    at: nowIso(),
    detail: reason,
    result: "rejected",
  });
  throw error instanceof Error ? error : new Error(reason);
}

function auditTarget(collection, id, contentVersion) {
  const target = { collection, id };
  if (contentVersion !== undefined) target.contentVersion = contentVersion;
  return target;
}

export async function reviewCatalogVersion(db, input) {
  assertDemoProject(db);
  const objectId = input.objectId;
  const contentVersion = input.contentVersion;
  const target = auditTarget(OBJECTS, objectId, contentVersion);
  try {
    requireText(objectId, "objectId");
    requireText(contentVersion, "contentVersion");
    const reviewer = requireText(input.reviewer, "reviewer");
    if (input.decision !== "approved" && input.decision !== "rejected") {
      throw new Error("decision must be approved or rejected");
    }
    const snapshot = await readDoc(db, versionPath(objectId, contentVersion));
    if (snapshot === null) throw new Error("snapshot does not exist");
    if (snapshot.status !== "draft") throw new Error("snapshot status must be draft");
    if (snapshot.reviewStatus !== "pending" && snapshot.reviewStatus !== "rejected") {
      throw new Error("reviewStatus must be pending or rejected");
    }
    const reviewedAt = nowIso();
    const batch = db.batch();
    batch.update(db.doc(versionPath(objectId, contentVersion)), {
      reviewStatus: input.decision,
      reviewer,
      reviewedAt,
    });
    batch.set(db.collection(collectionPath(AUDIT)).doc(), {
      action: "review",
      actor: reviewer,
      target,
      at: reviewedAt,
      detail: input.decision,
      result: "ok",
    });
    await batch.commit();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("refusing to run")) throw error;
    await reject(db, "review", input.reviewer, target, error);
  }
}

function publishedParent(parent, snapshot, publishedAt) {
  const next = {
    id: parent.id,
    kind: parent.kind,
    sportId: parent.sportId,
    localeContent: snapshot.localeContent,
    taxonomy: snapshot.taxonomy,
    refs: snapshot.refs,
    legacyAttributes: snapshot.legacyAttributes,
    schemaVersion: snapshot.schemaVersion,
    contentVersion: snapshot.contentVersion,
    status: "published",
    reviewStatus: snapshot.reviewStatus,
    reviewer: snapshot.reviewer,
    reviewedAt: snapshot.reviewedAt,
    checksum: snapshot.checksum,
    publishedVersion: snapshot.contentVersion,
    createdAt: typeof parent.createdAt === "string" ? parent.createdAt : publishedAt,
    updatedAt: publishedAt,
  };
  if (snapshot.supersedesVersion !== undefined) next.supersedesVersion = snapshot.supersedesVersion;
  if (parent.disciplineId !== undefined) next.disciplineId = parent.disciplineId;
  if (parent.sourceLegacyId !== undefined) next.sourceLegacyId = parent.sourceLegacyId;
  return next;
}

function releaseBody(snapshot, objectId, notes, publishedAt) {
  const release = {
    objectId,
    contentVersion: snapshot.contentVersion,
    checksum: snapshot.checksum,
    publishedVersion: snapshot.contentVersion,
    status: "published",
    reviewStatus: "approved",
    reviewer: snapshot.reviewer,
    reviewedAt: snapshot.reviewedAt,
    createdAt: publishedAt,
  };
  if (typeof notes === "string" && notes !== "") release.notes = notes;
  return release;
}

function isSamePublishedRelease(release, snapshot, objectId) {
  return (
    release !== null &&
    release.objectId === objectId &&
    release.contentVersion === snapshot.contentVersion &&
    release.publishedVersion === snapshot.contentVersion &&
    release.checksum === snapshot.checksum &&
    release.status === "published"
  );
}

async function validatePublish(db, input) {
  const { objectId, contentVersion } = input;
  const snapshot = await readDoc(db, versionPath(objectId, contentVersion));
  if (snapshot === null) throw new Error("snapshot does not exist");
  if (snapshot.contentVersion !== contentVersion) {
    throw new Error("snapshot contentVersion does not match the path");
  }
  const parent = await readDoc(db, objectPath(objectId));
  if (parent === null) throw new Error("parent does not exist");
  const release = await readDoc(db, `${collectionPath(RELEASES)}/${releaseDocId(objectId, contentVersion)}`);

  // Already published and bound: do not write again, including the success audit.
  if (
    snapshot.status === "published" &&
    parent.status === "published" &&
    parent.publishedVersion === contentVersion &&
    parent.contentVersion === contentVersion &&
    isSamePublishedRelease(release, snapshot, objectId) &&
    checkPublishedBinding(parent, snapshot).length === 0
  ) {
    return { idempotent: true };
  }

  if (snapshot.status !== "draft") throw new Error("snapshot status must be draft");
  // Frozen check: draft + approved + a real reviewer and reviewedAt. Caller fields are ignored.
  const publishedSnapshot = publishCatalogVersion(snapshot);
  if (parent.status !== "draft" && parent.status !== "published") {
    throw new Error("parent status must be draft or published");
  }
  let recomputed;
  try {
    recomputed = recomputeChecksum(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`checksum input is not canonical JSON: ${message}`, { cause: error });
  }
  if (recomputed !== snapshot.checksum) throw new Error("checksum does not match content");
  const editor = await lastEditor(db, objectId);
  if (editor === null) throw new Error("no create, edit, or import audit record");
  if (editor === String(snapshot.reviewer).trim()) throw new Error("reviewer matches the last editor");
  if (snapshot.legacyAttributes?.safetyFlag === "review_required") {
    throw new Error("safetyFlag review_required blocks publish");
  }
  if (release !== null && !isSamePublishedRelease(release, snapshot, objectId)) {
    throw new Error("release does not match the version being published");
  }
  return { idempotent: false, publishedSnapshot };
}

export async function publishCatalogVersionFlow(db, input) {
  assertDemoProject(db);
  const actor = requireText(input.reviewer, "reviewer");
  const objectId = requireText(input.objectId, "objectId");
  const contentVersion = requireText(input.contentVersion, "contentVersion");
  const target = auditTarget(OBJECTS, objectId, contentVersion);
  let plan;
  try {
    plan = await validatePublish(db, { objectId, contentVersion });
  } catch (error) {
    await reject(db, "publish", actor, target, error);
  }
  if (plan.idempotent) return;

  const publishedAt = nowIso();
  try {
    await db.runTransaction(async (tx) => {
      const snapshotSnap = await tx.get(db.doc(versionPath(objectId, contentVersion)));
      const parentSnap = await tx.get(db.doc(objectPath(objectId)));
      if (!snapshotSnap.exists || !parentSnap.exists) throw new Error("snapshot or parent disappeared");
      const snapshot = snapshotSnap.data();
      const parent = parentSnap.data();
      if (snapshot.status !== "draft") throw new Error("snapshot status must be draft");
      const publishedSnapshot = publishCatalogVersion(snapshot);
      if (recomputeChecksum(snapshot) !== snapshot.checksum) {
        throw new Error("checksum does not match content");
      }
      const editor = await lastEditor(db, objectId);
      if (editor === null) throw new Error("no create, edit, or import audit record");
      if (editor === String(snapshot.reviewer).trim()) throw new Error("reviewer matches the last editor");
      if (snapshot.legacyAttributes?.safetyFlag === "review_required") {
        throw new Error("safetyFlag review_required blocks publish");
      }
      const nextParent = publishedParent(parent, snapshot, publishedAt);
      tx.set(db.doc(objectPath(objectId)), nextParent);
      tx.update(db.doc(versionPath(objectId, contentVersion)), { status: "published" });
      tx.set(
        db.doc(`${collectionPath(RELEASES)}/${releaseDocId(objectId, contentVersion)}`),
        releaseBody(snapshot, objectId, input.notes, publishedAt),
      );
      tx.set(db.collection(collectionPath(AUDIT)).doc(), {
        action: "publish",
        actor,
        target,
        at: publishedAt,
        result: "ok",
        ...(typeof input.notes === "string" && input.notes !== "" ? { detail: input.notes } : {}),
      });
      const bindingErrors = checkPublishedBinding(nextParent, publishedSnapshot);
      if (bindingErrors.length > 0) {
        throw new Error(`published binding failed: ${bindingErrors.join("; ")}`);
      }
    });
  } catch (error) {
    await reject(db, "publish", actor, target, error);
  }
}

export async function withdrawCatalogVersion(db, input) {
  assertDemoProject(db);
  const actor = requireText(input.actor, "actor");
  const objectId = requireText(input.objectId, "objectId");
  const contentVersion = requireText(input.contentVersion, "contentVersion");
  const target = auditTarget(OBJECTS, objectId, contentVersion);
  const parent = await readDoc(db, objectPath(objectId));
  try {
    if (parent === null) throw new Error("parent does not exist");
    if (parent.status !== "published" || parent.publishedVersion !== contentVersion) {
      throw new Error("withdraw requires a published parent pointing at this version");
    }
  } catch (error) {
    await reject(db, "withdraw", actor, target, error);
  }
  const withdrawnAt = nowIso();
  await db.runTransaction(async (tx) => {
    const parentSnap = await tx.get(db.doc(objectPath(objectId)));
    const fresh = parentSnap.data();
    if (
      !parentSnap.exists ||
      fresh.status !== "published" ||
      fresh.publishedVersion !== contentVersion
    ) {
      throw new Error("withdraw requires a published parent pointing at this version");
    }
    tx.update(db.doc(objectPath(objectId)), {
      status: "deprecated",
      publishedVersion: FieldValue.delete(),
      updatedAt: withdrawnAt,
    });
    tx.set(db.collection(collectionPath(AUDIT)).doc(), {
      action: "withdraw",
      actor,
      target,
      at: withdrawnAt,
      result: "ok",
    });
  });
}

export async function revokeCatalogApprovalFlow(db, input) {
  assertDemoProject(db);
  const actor = requireText(input.actor, "actor");
  const objectId = requireText(input.objectId, "objectId");
  const contentVersion = requireText(input.contentVersion, "contentVersion");
  const target = auditTarget(OBJECTS, objectId, contentVersion);
  const parent = await readDoc(db, objectPath(objectId));
  const snapshot = await readDoc(db, versionPath(objectId, contentVersion));
  let revoked;
  try {
    if (parent === null) throw new Error("parent does not exist");
    if (snapshot === null) throw new Error("snapshot does not exist");
    revoked = revokeCatalogApproval(parent);
  } catch (error) {
    await reject(db, "revoke", actor, target, error);
  }
  const revokedAt = nowIso();
  const batch = db.batch();
  batch.set(db.doc(objectPath(objectId)), revoked);
  batch.update(db.doc(versionPath(objectId, contentVersion)), {
    status: "draft",
    reviewStatus: "pending",
    reviewer: FieldValue.delete(),
    reviewedAt: FieldValue.delete(),
  });
  batch.set(db.collection(collectionPath(AUDIT)).doc(), {
    action: "revoke",
    actor,
    target,
    at: revokedAt,
    result: "ok",
  });
  await batch.commit();
}

async function reviewRecord(db, collectionName, id, reviewer, decision, action) {
  assertDemoProject(db);
  const target = auditTarget(collectionName, id);
  try {
    requireText(id, "id");
    const reviewerId = requireText(reviewer, "reviewer");
    if (decision !== "approved" && decision !== "rejected") {
      throw new Error("decision must be approved or rejected");
    }
    const current = await readDoc(db, `${collectionPath(collectionName)}/${id}`);
    if (current === null) throw new Error("document does not exist");
    if (current.status !== undefined && current.status !== "draft") {
      throw new Error("status must be draft");
    }
    if (current.reviewStatus !== "pending" && current.reviewStatus !== "rejected") {
      throw new Error("reviewStatus must be pending or rejected");
    }
    const reviewedAt = nowIso();
    const batch = db.batch();
    batch.update(db.doc(`${collectionPath(collectionName)}/${id}`), {
      reviewStatus: decision,
      reviewer: reviewerId,
      reviewedAt,
    });
    batch.set(db.collection(collectionPath(AUDIT)).doc(), {
      action,
      actor: reviewerId,
      target,
      at: reviewedAt,
      detail: decision,
      result: "ok",
    });
    await batch.commit();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("refusing to run")) throw error;
    await reject(db, action, reviewer, target, error);
  }
}

export async function reviewCatalogLink(db, input) {
  await reviewRecord(db, LINKS, input.academyItemId, input.reviewer, input.decision, "link_review");
}

function catalogRefOf(link) {
  const ref = link.catalogRef;
  if (
    ref === null ||
    typeof ref !== "object" ||
    typeof ref.kind !== "string" ||
    typeof ref.id !== "string" ||
    typeof ref.contentVersion !== "string"
  ) {
    throw new Error("catalogRef must contain kind, id, and contentVersion");
  }
  return { kind: ref.kind, id: ref.id, contentVersion: ref.contentVersion };
}

export async function publishCatalogLink(db, input) {
  assertDemoProject(db);
  const actor = requireText(input.actor, "actor");
  const academyItemId = requireText(input.academyItemId, "academyItemId");
  const target = auditTarget(LINKS, academyItemId);
  let catalogRef;
  try {
    const link = await readDoc(db, `${collectionPath(LINKS)}/${academyItemId}`);
    if (link === null) throw new Error("link does not exist");
    const reviewerReady = typeof link.reviewer === "string" && link.reviewer.trim() !== "";
    if (link.reviewStatus !== "approved" || !reviewerReady || !isTimestamp(link.reviewedAt)) {
      throw new Error("link is not approved");
    }
    catalogRef = catalogRefOf(link);
    const parent = await readDoc(db, objectPath(catalogRef.id));
    if (parent === null) throw new Error("target does not exist");
    if (parent.status !== "published" || parent.publishedVersion !== catalogRef.contentVersion) {
      throw new Error("target is not published at the linked version");
    }
  } catch (error) {
    await reject(db, "link_publish", actor, target, error);
  }
  const publishedAt = nowIso();
  try {
    await db.runTransaction(async (tx) => {
      const linkSnap = await tx.get(db.doc(`${collectionPath(LINKS)}/${academyItemId}`));
      const parentSnap = await tx.get(db.doc(objectPath(catalogRef.id)));
      if (!linkSnap.exists || !parentSnap.exists) throw new Error("link or target disappeared");
      const link = linkSnap.data();
      const parent = parentSnap.data();
      const freshRef = catalogRefOf(link);
      if (parent.status !== "published" || parent.publishedVersion !== freshRef.contentVersion) {
        throw new Error("target is not published at the linked version");
      }
      tx.set(db.doc(`${collectionPath(PUBLIC_LINKS)}/${academyItemId}`), { catalogRef: freshRef });
      tx.set(db.collection(collectionPath(AUDIT)).doc(), {
        action: "link_publish",
        actor,
        target,
        at: publishedAt,
        result: "ok",
      });
    });
  } catch (error) {
    await reject(db, "link_publish", actor, target, error);
  }
}

export async function withdrawCatalogLink(db, input) {
  assertDemoProject(db);
  const actor = requireText(input.actor, "actor");
  const academyItemId = requireText(input.academyItemId, "academyItemId");
  const target = auditTarget(PUBLIC_LINKS, academyItemId);
  const projectionPath = `${collectionPath(PUBLIC_LINKS)}/${academyItemId}`;
  const projection = await readDoc(db, projectionPath);
  if (projection === null) {
    await reject(db, "link_withdraw", actor, target, new Error("projection does not exist"));
  }
  const withdrawnAt = nowIso();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.doc(projectionPath));
    if (!snap.exists) throw new Error("projection does not exist");
    tx.delete(db.doc(projectionPath));
    tx.set(db.collection(collectionPath(AUDIT)).doc(), {
      action: "link_withdraw",
      actor,
      target,
      at: withdrawnAt,
      result: "ok",
    });
  });
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return { command, args };
}

async function main() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
  assertCatalogProject(projectId);
  const { command, args } = parseArgs(process.argv.slice(2));
  const app = initializeApp({ projectId });
  const db = getFirestore(app);
  if (command === "review") {
    await reviewCatalogVersion(db, args);
  } else if (command === "publish") {
    await publishCatalogVersionFlow(db, args);
  } else if (command === "withdraw") {
    await withdrawCatalogVersion(db, args);
  } else if (command === "revoke") {
    await revokeCatalogApprovalFlow(db, args);
  } else if (command === "link-review") {
    await reviewCatalogLink(db, args);
  } else if (command === "link-publish") {
    await publishCatalogLink(db, args);
  } else if (command === "link-withdraw") {
    await withdrawCatalogLink(db, args);
  } else {
    throw new Error(
      "usage: review | publish | withdraw | revoke | link-review | link-publish | link-withdraw",
    );
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
