// Trusted catalog review and publish. Admin SDK only.
//
// The default path runs against the Firestore emulator and refuses a project
// id that does not start with demo-. Production is a separate gated path and
// is not opened by importing this file.
//
// The CLI (main()) is the only supported production entry point. The exported
// functions must not be called directly with a production database outside it.
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import {
  EXPECTED_DATABASE_ID,
  PRODUCTION_PROJECT_ID,
  assertExecutionTarget,
  assertServiceAccountIdentity,
  confirmPolicyOpsProject,
  identityFromAdcPayload,
  readPolicyOpsConfirmation,
} from "./import-guard.mjs";

import {
  contentChecksumPayload,
  publishCatalogVersion,
  revokeCatalogApproval,
} from "../../packages/training-catalog/src/catalog-object.ts";
import { checkPublishedBinding } from "../../packages/training-catalog/src/validate.ts";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum.ts";
import { CONDITIONAL_SAFETY_OBJECT_IDS, evaluateSafety } from "../../packages/training-catalog/src/safety-evaluate.ts";
import { parseSafetyPolicy } from "../../packages/training-catalog/src/safety-policy.ts";

const ROOT = "artifacts/skatingx-production";
const OBJECTS = "trainingCatalogObjects";
const RELEASES = "trainingCatalogReleases";
const LINKS = "trainingCatalogLinks";
const PUBLIC_LINKS = "trainingCatalogPublicLinks";
const AUDIT = "trainingCatalogAuditLogs";
const POLICIES = "trainingCatalogSafetyPolicies";
const POINTERS = "trainingCatalogSafetyPolicyPointers";
const KNOWLEDGE_ARTICLES = "trainingCatalogKnowledgeArticles";
const EDITOR_ACTIONS = new Set(["create", "edit", "import"]);
const CONTENT_HASH_OMIT = new Set([
  "status",
  "reviewStatus",
  "reviewer",
  "reviewedAt",
  "publishedAt",
  "reviewedContentSha256",
]);

function canonical(value) {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(doc) {
  const body = {};
  for (const key of Object.keys(doc)) {
    if (!CONTENT_HASH_OMIT.has(key)) body[key] = doc[key];
  }
  return createHash("sha256").update(canonical(body)).digest("hex");
}

function assertReviewedContent(doc) {
  if (typeof doc.reviewedContentSha256 !== "string" || contentHash(doc) !== doc.reviewedContentSha256) {
    throw new Error("content changed since review");
  }
}

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

export function assertProductionProject(db) {
  if (projectIdOf(db) !== PRODUCTION_PROJECT_ID) {
    throw new Error("refusing to run: production project id must be skatingx-prod");
  }
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (typeof emulatorHost === "string" && emulatorHost.trim() !== "") {
    throw new Error("refusing to run: FIRESTORE_EMULATOR_HOST must be unset for production");
  }
}

function assertFlowProject(db, target = "emulator") {
  if (target === "production") assertProductionProject(db);
  else assertDemoProject(db);
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

function operatorField(operator) {
  if (typeof operator !== "string" || operator.trim() === "") return {};
  return { operator };
}

async function reject(db, action, actor, target, error, operator) {
  const original = error instanceof Error ? error : new Error(String(error));
  try {
    await writeAudit(db, {
      action,
      actor: typeof actor === "string" && actor.trim() !== "" ? actor.trim() : "(missing)",
      target,
      at: nowIso(),
      detail: original.message,
      result: "rejected",
      ...operatorField(operator),
    });
  } catch (auditError) {
    // Keep the original failure as the message and on the audit error, then surface the audit
    // write failure. Either way this throws, so a failed audit write cannot look like success.
    if (auditError instanceof Error && auditError.cause === undefined) {
      auditError.cause = original;
    }
    throw new Error(original.message, { cause: auditError });
  }
  throw original;
}

function auditTarget(collection, id, contentVersion) {
  const target = { collection, id };
  if (contentVersion !== undefined) target.contentVersion = contentVersion;
  return target;
}

export async function reviewCatalogVersion(db, input, options = {}) {
  assertFlowProject(db, options.target);
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

export async function publishCatalogVersionFlow(db, input, options = {}) {
  assertFlowProject(db, options.target);
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

export async function withdrawCatalogVersion(db, input, options = {}) {
  assertFlowProject(db, options.target);
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
  try {
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
  } catch (error) {
    await reject(db, "withdraw", actor, target, error);
  }
}

export async function revokeCatalogApprovalFlow(db, input, options = {}) {
  assertFlowProject(db, options.target);
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
  try {
    await batch.commit();
  } catch (error) {
    await reject(db, "revoke", actor, target, error);
  }
}

async function reviewRecord(db, collectionName, id, reviewer, decision, action, flowTarget, operator, expectedContentSha256, validate) {
  assertFlowProject(db, flowTarget);
  const target = auditTarget(collectionName, id);
  try {
    requireText(id, "id");
    const reviewerId = requireText(reviewer, "reviewer");
    const expectedDigest = requireText(expectedContentSha256, "expectedContentSha256");
    if (decision !== "approved" && decision !== "rejected") {
      throw new Error("decision must be approved or rejected");
    }
    const docPath = `${collectionPath(collectionName)}/${id}`;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(db.doc(docPath));
      if (!snap.exists) throw new Error("document does not exist");
      const current = snap.data();
      if (current === undefined) throw new Error("document does not exist");
      if (current.status !== undefined && current.status !== "draft") {
        throw new Error("status must be draft");
      }
      // A missing field is the initial pending state. null, "", and any other value are not.
      if (
        current.reviewStatus !== undefined &&
        current.reviewStatus !== "pending" &&
        current.reviewStatus !== "rejected"
      ) {
        throw new Error("reviewStatus must be pending or rejected");
      }
      validate?.(current);
      if (contentHash(current) !== expectedDigest) throw new Error("content changed since review");
      const reviewedAt = nowIso();
      tx.update(db.doc(docPath), {
        reviewStatus: decision,
        reviewer: reviewerId,
        reviewedAt,
        reviewedContentSha256: expectedDigest,
      });
      tx.set(db.collection(collectionPath(AUDIT)).doc(), {
        action,
        actor: reviewerId,
        target,
        at: reviewedAt,
        detail: decision,
        result: "ok",
        reviewedContentSha256: expectedDigest,
        ...operatorField(operator),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("refusing to run")) throw error;
    await reject(db, action, reviewer, target, error, operator);
  }
}

function assertPolicyIdentity(current, policyId, policyVersion) {
  if (
    typeof current.policyId !== "string" ||
    current.policyId !== policyId ||
    typeof current.policyVersion !== "string" ||
    current.policyVersion !== policyVersion
  ) {
    throw new Error("policyId or policyVersion does not match the policy document");
  }
}

export async function reviewCatalogLink(db, input, options = {}) {
  assertFlowProject(db, options.target);
  const expectedContentSha256 = requireText(input.expectedContentSha256, "expectedContentSha256");
  await reviewRecord(
    db,
    LINKS,
    input.academyItemId,
    input.reviewer,
    input.decision,
    "link_review",
    options.target,
    options.operator,
    expectedContentSha256,
  );
}

export async function reviewKnowledgeArticle(db, input, options = {}) {
  const operator = operatorForWrite(db, options, false);
  const expectedContentSha256 = requireText(input.expectedContentSha256, "expectedContentSha256");
  await reviewRecord(
    db,
    KNOWLEDGE_ARTICLES,
    input.articleId,
    input.reviewer,
    input.decision,
    "article_review",
    options.target,
    operator,
    expectedContentSha256,
  );
}

export function policyDocId(policyId, policyVersion) {
  return `${policyId}--v${policyVersion}`;
}

export async function reviewSafetyPolicy(db, input, options = {}) {
  const operator = operatorForWrite(db, options, false);
  const policyId = requireText(input.policyId, "policyId");
  const policyVersion = requireText(input.policyVersion, "policyVersion");
  const expectedContentSha256 = requireText(input.expectedContentSha256, "expectedContentSha256");
  await reviewRecord(
    db,
    POLICIES,
    policyDocId(policyId, policyVersion),
    input.reviewer,
    input.decision,
    "policy_review",
    options.target,
    operator,
    expectedContentSha256,
    (current) => assertPolicyIdentity(current, policyId, policyVersion),
  );
}

function reviewApproved(record) {
  return (
    record.reviewStatus === "approved" &&
    typeof record.reviewer === "string" &&
    record.reviewer.trim() !== "" &&
    isTimestamp(record.reviewedAt)
  );
}

async function publishReviewedDraft(db, collectionName, id, actor, action, missingMessage, unapprovedMessage, validate, operator) {
  const target = auditTarget(collectionName, id);
  const docPath = `${collectionPath(collectionName)}/${id}`;
  try {
    const current = await readDoc(db, docPath);
    if (current === null) throw new Error(missingMessage);
    if (!reviewApproved(current)) throw new Error(unapprovedMessage);
  } catch (error) {
    await reject(db, action, actor, target, error, operator);
  }
  const publishedAt = nowIso();
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(db.doc(docPath));
      if (!snap.exists) throw new Error(missingMessage);
      const current = snap.data();
      if (current.status !== "draft") throw new Error("status must be draft");
      if (!reviewApproved(current)) throw new Error(unapprovedMessage);
      assertReviewedContent(current);
      validate?.(current);
      tx.update(db.doc(docPath), { status: "published", publishedAt });
      tx.set(db.collection(collectionPath(AUDIT)).doc(), {
        action,
        actor,
        target,
        at: publishedAt,
        result: "ok",
        ...operatorField(operator),
      });
    });
  } catch (error) {
    await reject(db, action, actor, target, error, operator);
  }
}

export async function publishKnowledgeArticle(db, input, options = {}) {
  const operator = operatorForWrite(db, options, false);
  const actor = requireText(input.actor, "actor");
  const articleId = requireText(input.articleId, "articleId");
  await publishReviewedDraft(
    db,
    KNOWLEDGE_ARTICLES,
    articleId,
    actor,
    "article_publish",
    "article does not exist",
    "article is not approved",
    undefined,
    operator,
  );
}

export async function publishSafetyPolicy(db, input, options = {}) {
  const operator = operatorForWrite(db, options, false);
  const actor = requireText(input.actor, "actor");
  const policyId = requireText(input.policyId, "policyId");
  const policyVersion = requireText(input.policyVersion, "policyVersion");
  await publishReviewedDraft(
    db,
    POLICIES,
    policyDocId(policyId, policyVersion),
    actor,
    "policy_publish",
    "policy does not exist",
    "policy is not approved",
    (current) => {
      assertPolicyIdentity(current, policyId, policyVersion);
      // parseSafetyPolicy requires status published, and this transaction has not written it yet.
      const parsed = parseSafetyPolicy({ ...current, status: "published" });
      if (!parsed.ok) throw new Error("safety policy is invalid");
    },
    operator,
  );
}

function linkApproved(link) {
  return (
    link.reviewStatus === "approved" &&
    typeof link.reviewer === "string" &&
    link.reviewer.trim() !== "" &&
    isTimestamp(link.reviewedAt)
  );
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

export async function publishCatalogLink(db, input, options = {}) {
  assertFlowProject(db, options.target);
  const actor = requireText(input.actor, "actor");
  const academyItemId = requireText(input.academyItemId, "academyItemId");
  const target = auditTarget(LINKS, academyItemId);
  let catalogRef;
  try {
    const link = await readDoc(db, `${collectionPath(LINKS)}/${academyItemId}`);
    if (link === null) throw new Error("link does not exist");
    if (!linkApproved(link)) throw new Error("link is not approved");
    catalogRef = catalogRefOf(link);
    const parent = await readDoc(db, objectPath(catalogRef.id));
    if (parent === null) throw new Error("target does not exist");
    if (parent.status !== "published" || parent.publishedVersion !== catalogRef.contentVersion) {
      throw new Error("target is not published at the linked version");
    }
  } catch (error) {
    await reject(db, "link_publish", actor, target, error, options.operator);
  }
  const publishedAt = nowIso();
  try {
    await db.runTransaction(async (tx) => {
      const linkSnap = await tx.get(db.doc(`${collectionPath(LINKS)}/${academyItemId}`));
      const parentSnap = await tx.get(db.doc(objectPath(catalogRef.id)));
      if (!linkSnap.exists || !parentSnap.exists) throw new Error("link or target disappeared");
      const link = linkSnap.data();
      const parent = parentSnap.data();
      if (!linkApproved(link)) throw new Error("link is not approved");
      assertReviewedContent(link);
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
        ...operatorField(options.operator),
      });
    });
  } catch (error) {
    await reject(db, "link_publish", actor, target, error, options.operator);
  }
}

export async function withdrawCatalogLink(db, input, options = {}) {
  assertFlowProject(db, options.target);
  const actor = requireText(input.actor, "actor");
  const academyItemId = requireText(input.academyItemId, "academyItemId");
  const target = auditTarget(PUBLIC_LINKS, academyItemId);
  const projectionPath = `${collectionPath(PUBLIC_LINKS)}/${academyItemId}`;
  const projection = await readDoc(db, projectionPath);
  if (projection === null) {
    await reject(db, "link_withdraw", actor, target, new Error("projection does not exist"));
  }
  const withdrawnAt = nowIso();
  try {
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
  } catch (error) {
    await reject(db, "link_withdraw", actor, target, error);
  }
}

function pointerPath(policyId) {
  return `${collectionPath(POINTERS)}/${policyId}`;
}

function pointerTarget(policyId) {
  return auditTarget(POINTERS, policyId);
}

function requireOperator(options) {
  return requireText(options.operator, "operator");
}

// Not exported. A caller cannot mint this brand, and copying the object drops it.
const PRODUCTION_CONTEXT = Symbol("skatingx.policyOpsExecutionContext");

function issueProductionExecutionContext(operator) {
  const context = { operator };
  Object.defineProperty(context, PRODUCTION_CONTEXT, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return context;
}

function productionOperator(context) {
  if (
    !context ||
    context[PRODUCTION_CONTEXT] !== true ||
    typeof context.operator !== "string" ||
    context.operator.trim() === ""
  ) {
    throw new Error("refusing to run: production execution context is required");
  }
  return context.operator.trim();
}

// Production ignores options.operator. The gate-issued context is the only operator.
function operatorForWrite(db, options, required) {
  if (options.target === "production") {
    const operator = productionOperator(options.executionContext);
    assertFlowProject(db, "production");
    return operator;
  }
  assertFlowProject(db, options.target);
  return required ? requireOperator(options) : options.operator;
}

function requireInteger(value, label) {
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new Error(`${label} must be an integer`);
}

function storedActive(pointer) {
  if (!pointer) return undefined;
  const active = pointer.activePolicyVersion;
  if (active === null || typeof active === "string") return active;
  throw new Error("pointer activePolicyVersion is invalid");
}

async function assertPolicyTarget(tx, db, policyId, policyVersion) {
  const snap = await tx.get(db.doc(`${collectionPath(POLICIES)}/${policyDocId(policyId, policyVersion)}`));
  if (!snap.exists) throw new Error("policy does not exist");
  const data = snap.data();
  if (!data) throw new Error("policy does not exist");
  if (typeof data.policyId !== "string" || data.policyId !== policyId) {
    throw new Error("policyId does not match the policy document");
  }
  if (typeof data.policyVersion !== "string" || data.policyVersion !== policyVersion) {
    throw new Error("policyVersion does not match the policy document");
  }
  if (data.status !== "published") throw new Error("status must be published");
  if (data.reviewStatus !== "approved") throw new Error("reviewStatus must be approved");
  const parsed = parseSafetyPolicy({ ...data, status: "published" });
  if (!parsed.ok) throw new Error("safety policy is invalid");
  return data;
}

function pointerRecord(policyId, activePolicyVersion, previousPolicyVersion, revision, operator, reason) {
  return {
    policyId,
    activePolicyVersion,
    previousPolicyVersion,
    revision,
    updatedBy: operator,
    updatedAt: nowIso(),
    reason,
  };
}

function bumpedRevision(pointer) {
  if (typeof pointer.revision !== "number" || !Number.isInteger(pointer.revision)) {
    throw new Error("pointer revision is invalid");
  }
  return pointer.revision + 1;
}

function writeOkAudit(tx, db, action, operator, policyId, detail, changed) {
  tx.set(db.collection(collectionPath(AUDIT)).doc(), {
    action,
    actor: operator,
    target: pointerTarget(policyId),
    at: nowIso(),
    detail,
    result: "ok",
    changed,
    ...operatorField(operator),
  });
}

/**
 * Enable, disable, and rollback share this failure path: the transaction has
 * already rolled back, so the rejected audit is a separate write.
 */
async function rejectPointer(db, action, operator, policyId, error) {
  if (error instanceof Error && error.message.startsWith("refusing to run")) throw error;
  await reject(db, action, operator, pointerTarget(policyId), error, operator);
}

export async function enablePolicyPointer(db, input, options = {}) {
  const operator = operatorForWrite(db, options, true);
  const policyId = requireText(input.policyId, "policyId");
  const policyVersion = requireText(input.policyVersion, "policyVersion");
  const reason = requireText(input.reason, "reason");
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(pointerPath(policyId));
      const snap = await tx.get(ref);
      const current = snap.exists ? snap.data() : null;
      await assertPolicyTarget(tx, db, policyId, policyVersion);
      if (current && current.activePolicyVersion === policyVersion) {
        writeOkAudit(
          tx,
          db,
          "policy_enable",
          operator,
          policyId,
          `already enabled at version ${policyVersion}, no change`,
          false,
        );
        return;
      }
      const previousPolicyVersion = current ? storedActive(current) ?? null : null;
      const revision = current ? bumpedRevision(current) : 1;
      tx.set(ref, pointerRecord(policyId, policyVersion, previousPolicyVersion, revision, operator, reason));
      writeOkAudit(tx, db, "policy_enable", operator, policyId, reason, true);
    });
  } catch (error) {
    await rejectPointer(db, "policy_enable", operator, policyId, error);
  }
}

export async function disablePolicyPointer(db, input, options = {}) {
  const operator = operatorForWrite(db, options, true);
  const policyId = requireText(input.policyId, "policyId");
  const reason = requireText(input.reason, "reason");
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(pointerPath(policyId));
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("pointer does not exist");
      const current = snap.data();
      if (!current) throw new Error("pointer does not exist");
      if (current.activePolicyVersion === null) {
        writeOkAudit(tx, db, "policy_disable", operator, policyId, "already disabled, no change", false);
        return;
      }
      const previousPolicyVersion = storedActive(current);
      if (typeof previousPolicyVersion !== "string" || previousPolicyVersion.trim() === "") {
        throw new Error("pointer activePolicyVersion is invalid");
      }
      tx.set(ref, pointerRecord(
        policyId,
        null,
        previousPolicyVersion,
        bumpedRevision(current),
        operator,
        reason,
      ));
      writeOkAudit(tx, db, "policy_disable", operator, policyId, reason, true);
    });
  } catch (error) {
    await rejectPointer(db, "policy_disable", operator, policyId, error);
  }
}

export async function rollbackPolicyPointer(db, input, options = {}) {
  const operator = operatorForWrite(db, options, true);
  const policyId = requireText(input.policyId, "policyId");
  const reason = requireText(input.reason, "reason");
  const expectedRevision = requireInteger(input.expectedRevision, "expectedRevision");
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(pointerPath(policyId));
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("pointer does not exist");
      const current = snap.data();
      if (!current) throw new Error("pointer does not exist");
      if (current.revision !== expectedRevision) {
        throw new Error(
          `pointer revision mismatch: expected ${expectedRevision}, found ${current.revision} — re-read the pointer and retry`,
        );
      }
      const active = storedActive(current);
      if (active === null || active === undefined || active.trim() === "") {
        throw new Error("pointer is disabled; enable an explicit version");
      }
      const previous = current.previousPolicyVersion;
      if (typeof previous !== "string" || previous.trim() === "") {
        throw new Error("previousPolicyVersion is not set");
      }
      await assertPolicyTarget(tx, db, policyId, previous);
      tx.set(ref, pointerRecord(policyId, previous, active, bumpedRevision(current), operator, reason));
      writeOkAudit(tx, db, "policy_rollback", operator, policyId, reason, true);
    });
  } catch (error) {
    await rejectPointer(db, "policy_rollback", operator, policyId, error);
  }
}

const FLOW_COMMANDS = new Set([
  "review",
  "publish",
  "withdraw",
  "revoke",
  "link-review",
  "link-publish",
  "link-withdraw",
  "article-review",
  "article-publish",
  "policy-review",
  "policy-publish",
  "policy-enable",
  "policy-disable",
  "policy-rollback",
  "policy-status",
]);
const PRODUCTION_COMMANDS = new Set([
  "article-review",
  "article-publish",
  "policy-review",
  "policy-publish",
  "policy-enable",
  "policy-disable",
  "policy-rollback",
  "policy-status",
]);
const FLOW_ARG_KEYS = new Set([
  "target",
  "project",
  "confirm",
  "objectId",
  "contentVersion",
  "reviewer",
  "decision",
  "notes",
  "actor",
  "academyItemId",
  "articleId",
  "policyId",
  "policyVersion",
  "reason",
  "expectedRevision",
]);
const FLOW_USAGE = `usage: ${[...FLOW_COMMANDS].join(" | ")}`;

export function assertProductionCommand(command) {
  if (!PRODUCTION_COMMANDS.has(command)) {
    throw new Error(`command ${command} is not allowed with --target production`);
  }
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--yes") throw new Error("refusing to run: --yes is not a confirmation");
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    if (!FLOW_ARG_KEYS.has(key)) throw new Error(`unknown argument --${key}`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return { command, args };
}

function flowInput(args) {
  const input = { ...args };
  delete input.target;
  delete input.project;
  delete input.confirm;
  return input;
}

async function inputWithExpectedDigest(db, collectionName, id, input) {
  const current = await readDoc(db, `${collectionPath(collectionName)}/${id}`);
  if (current === null) throw new Error("document does not exist");
  return { ...input, expectedContentSha256: contentHash(current) };
}

async function dispatchFlow(db, command, input, options) {
  if (command === "review") return reviewCatalogVersion(db, input, options);
  if (command === "publish") return publishCatalogVersionFlow(db, input, options);
  if (command === "withdraw") return withdrawCatalogVersion(db, input, options);
  if (command === "revoke") return revokeCatalogApprovalFlow(db, input, options);
  if (command === "link-review") {
    const academyItemId = requireText(input.academyItemId, "academyItemId");
    return reviewCatalogLink(db, await inputWithExpectedDigest(db, LINKS, academyItemId, input), options);
  }
  if (command === "link-publish") return publishCatalogLink(db, input, options);
  if (command === "link-withdraw") return withdrawCatalogLink(db, input, options);
  if (command === "article-review") {
    const articleId = requireText(input.articleId, "articleId");
    return reviewKnowledgeArticle(db, await inputWithExpectedDigest(db, KNOWLEDGE_ARTICLES, articleId, input), options);
  }
  if (command === "article-publish") return publishKnowledgeArticle(db, input, options);
  if (command === "policy-review") {
    const policyId = requireText(input.policyId, "policyId");
    const policyVersion = requireText(input.policyVersion, "policyVersion");
    return reviewSafetyPolicy(
      db,
      await inputWithExpectedDigest(db, POLICIES, policyDocId(policyId, policyVersion), input),
      options,
    );
  }
  if (command === "policy-publish") return publishSafetyPolicy(db, input, options);
  if (command === "policy-enable") return enablePolicyPointer(db, input, options);
  if (command === "policy-disable") return disablePolicyPointer(db, input, options);
  if (command === "policy-rollback") return rollbackPolicyPointer(db, input, options);
  if (command === "policy-status") return showPolicyPointer(db, input, options);
  throw new Error(FLOW_USAGE);
}

export async function openProductionFlowDb(project, confirm, readLine = readPolicyOpsConfirmation, dependencies = {}) {
  assertExecutionTarget({
    target: "production",
    projectId: project,
    confirm,
    emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    databaseId: EXPECTED_DATABASE_ID,
    execute: true,
  });
  const adcFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ?? "";
  if (adcFile === "") throw new Error("refusing to run: GOOGLE_APPLICATION_CREDENTIALS is not set");
  // run-import.mjs registers a module loader as soon as it is imported.
  const runtime = await import("./run-import.mjs");
  const bindVerifiedAdc = dependencies.bindVerifiedAdc ?? runtime.bindVerifiedAdc;
  const openProductionFirestore = dependencies.openProductionFirestore ?? runtime.openProductionFirestore;
  const productionFirestore = dependencies.productionFirestore ?? runtime.productionFirestore;
  const identity = identityFromAdcPayload(bindVerifiedAdc(adcFile));
  assertServiceAccountIdentity({ credential: identity, projectId: PRODUCTION_PROJECT_ID });
  await confirmPolicyOpsProject(PRODUCTION_PROJECT_ID, readLine);
  const db = productionFirestore(await openProductionFirestore(adcFile));
  const executionContext = issueProductionExecutionContext(identity.clientEmail);
  return { db, operator: identity.clientEmail, executionContext };
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (!FLOW_COMMANDS.has(command)) throw new Error(FLOW_USAGE);
  const flowTarget = args.target ?? "emulator";
  if (flowTarget !== "emulator" && flowTarget !== "production") {
    throw new Error("--target emulator|production is required");
  }
  const input = flowInput(args);
  if (flowTarget === "production") {
    assertProductionCommand(command);
    const { db, executionContext } = await openProductionFlowDb(args.project, args.confirm);
    await dispatchFlow(db, command, input, { target: "production", executionContext });
    return;
  }
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
  assertCatalogProject(projectId);
  const app = initializeApp({ projectId });
  const db = getFirestore(app);
  await dispatchFlow(db, command, input);
}

const SAFETY_READ_TIMEOUT_MS = 5000;

function failedSafetyRead() {
  return { decision: "review_required", reasonCodes: ["POLICY_MISSING"], policyVersion: null };
}

async function readWithin(read, timeoutMs) {
  let timer;
  const pending = Promise.resolve()
    .then(read)
    .then(
      (value) => ({ ok: true, value }),
      () => ({ ok: false }),
    );
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), timeoutMs);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readPolicyDocument(db, policyId, policyVersion) {
  const snap = await db.doc(`${collectionPath(POLICIES)}/${policyDocId(policyId, policyVersion)}`).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data) return null;
  if (typeof data.policyId !== "string" || data.policyId !== policyId) return null;
  if (typeof data.policyVersion !== "string" || data.policyVersion !== policyVersion) return null;
  return data;
}

/**
 * Emulator-only safety read. The caller supplies the Firestore client already
 * pointed at the emulator, or a readPolicy function in tests. A thrown read,
 * a timeout, and an empty result all evaluate as review_required.
 * This does not use a production service account.
 */
export async function assessEmulatorSafety(db, request, options = {}) {
  assertDemoProject(db);
  const policyId = requireText(request.policyId, "policyId");
  const policyVersion = requireText(request.policyVersion, "policyVersion");
  const readPolicy = options.readPolicy ?? (() => readPolicyDocument(db, policyId, policyVersion));
  const read = await readWithin(() => readPolicy({ policyId, policyVersion }), options.timeoutMs ?? SAFETY_READ_TIMEOUT_MS);
  if (!read.ok || read.value == null) return failedSafetyRead();
  return evaluateSafety(request, read.value);
}

export async function readPolicyPointer(db, policyId) {
  const id = requireText(policyId, "policyId");
  const snap = await db.doc(pointerPath(id)).get();
  if (!snap.exists) return null;
  return snap.data() ?? null;
}

function pointerStatusView(data) {
  return {
    policyId: data.policyId ?? null,
    activePolicyVersion: data.activePolicyVersion ?? null,
    previousPolicyVersion: data.previousPolicyVersion ?? null,
    revision: data.revision ?? null,
    updatedBy: data.updatedBy ?? null,
    updatedAt: data.updatedAt ?? null,
    reason: data.reason ?? null,
  };
}

/** Read-only. Prints the pointer JSON and writes neither the pointer nor an audit. */
export async function showPolicyPointer(db, input, options = {}) {
  assertFlowProject(db, options.target);
  const policyId = requireText(input.policyId, "policyId");
  const pointer = await readPolicyPointer(db, policyId);
  const view = pointer ? pointerStatusView(pointer) : null;
  console.log(JSON.stringify(view));
  return view;
}

function pointerAlert(decision, reasonCodes, policyVersion, pointerState, alertEvents) {
  return { decision, reasonCodes, policyVersion, pointerState, alertEvents };
}

function disabledPointer() {
  return pointerAlert("review_required", ["POLICY_MISSING"], null, "disabled", []);
}

function pointerReadError() {
  return pointerAlert("review_required", ["POLICY_MISSING"], null, "error", ["M-E1"]);
}

function textField(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * A missing pointer is not enabled. A stored pointer is classified only after
 * its fields are valid, so a broken document is never a normal disable.
 */
function classifyPointer(pointer, policyId) {
  if (pointer === null || pointer === undefined) return { kind: "disabled" };
  const active = pointer.activePolicyVersion;
  const previous = pointer.previousPolicyVersion;
  const activeOk = active === null || active === "" || textField(active);
  const previousOk = previous === null || typeof previous === "string";
  const broken = !textField(pointer.policyId)
    || pointer.policyId !== policyId
    || !activeOk
    || !previousOk
    || typeof pointer.revision !== "number"
    || !Number.isInteger(pointer.revision)
    || !textField(pointer.updatedBy)
    || !textField(pointer.updatedAt)
    || !textField(pointer.reason);
  if (broken) return { kind: "error" };
  if (active === null || active === "") return { kind: "disabled" };
  return { kind: "enabled", version: active };
}

function policyMatchesRequest(policy, policyId, policyVersion) {
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) return false;
  return typeof policy.policyId === "string"
    && policy.policyId === policyId
    && typeof policy.policyVersion === "string"
    && policy.policyVersion === policyVersion;
}

/**
 * Emulator pointer read. Production evaluation is a P4 consumer and is not
 * implemented here.
 *
 * P4 must use only the result for the current pointer. After a disable or a
 * failed read, do not reuse an old cache and do not switch to
 * previousPolicyVersion. A cache, if any, is keyed by revision: a new
 * revision invalidates it, and a disable clears it.
 */
export async function assessPointerSafety(db, request, options = {}) {
  assertDemoProject(db);
  const policyId = requireText(request.policyId, "policyId");
  const timeoutMs = options.timeoutMs ?? SAFETY_READ_TIMEOUT_MS;
  const readPointer = options.readPointer ?? (() => readPolicyPointer(db, policyId));
  const read = await readWithin(async () => {
    const pointer = await readPointer({ policyId });
    const classified = classifyPointer(pointer, policyId);
    if (classified.kind !== "enabled") return classified;
    const readPolicy = options.readPolicy
      ?? (() => readPolicyDocument(db, policyId, classified.version));
    const policy = await readPolicy({ policyId, policyVersion: classified.version });
    return { kind: "policy", version: classified.version, policy };
  }, timeoutMs);
  if (!read.ok) return pointerReadError();
  if (read.value.kind === "disabled") return disabledPointer();
  if (read.value.kind === "error") return pointerReadError();
  if (read.value.policy == null) return pointerReadError();
  if (!policyMatchesRequest(read.value.policy, policyId, read.value.version)) return pointerReadError();
  const parsed = parseSafetyPolicy(read.value.policy);
  if (!parsed.ok) {
    return pointerAlert("review_required", ["POLICY_INVALID"], read.value.version, "error", ["M-E2"]);
  }
  const evaluation = evaluateSafety(request, read.value.policy);
  const conditional = (CONDITIONAL_SAFETY_OBJECT_IDS).includes(request.objectId);
  const released = evaluation.decision === "allow" || evaluation.decision === "allow_with_supervision";
  const alertEvents = conditional && released ? ["M-E3"] : [];
  return pointerAlert(evaluation.decision, evaluation.reasonCodes, evaluation.policyVersion, "enabled", alertEvents);
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
