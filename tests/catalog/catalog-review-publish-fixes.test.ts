import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { CatalogKind } from "@skatingx/schema";
import { contentChecksumPayload } from "@skatingx/training-catalog";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum";
import {
  contentHash,
  editRecordId,
  importAuditId,
  INITIAL_IMPORT_RUN_ID,
  publishCatalogVersionFlow,
  reviewCatalogVersion,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const VERSION = "v1";
const FLOW = { operator: "emulator-operator" };

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-review-publish-fixes");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-review-publish-fixes");
  return getFirestore(app);
}

function documents(
  id: string,
  kind: CatalogKind,
  legacyAttributes: Record<string, unknown> = {},
  refs: Array<{ id: string; contentVersion: string }> = [],
) {
  const content = {
    localeContent: { zh: { name: id }, en: { name: id } },
    taxonomy: { objectiveIds: [] as string[] },
    refs,
    legacyAttributes,
    schemaVersion: 1,
  };
  const checksum = computeCatalogChecksum(contentChecksumPayload(content));
  const version = {
    ...content,
    contentVersion: VERSION,
    status: "draft",
    reviewStatus: "pending",
    checksum,
  };
  return {
    checksum,
    version,
    parent: {
      id,
      kind,
      sportId: "short_track",
      ...content,
      contentVersion: VERSION,
      status: "draft",
      reviewStatus: "pending",
      checksum,
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
    },
  };
}

async function seedDraft(
  db: Firestore,
  id: string,
  kind: CatalogKind,
  options: { editor?: string; legacyAttributes?: Record<string, unknown>; refs?: Array<{ id: string; contentVersion: string }> } = {},
): Promise<void> {
  const built = documents(id, kind, options.legacyAttributes, options.refs);
  const batch = db.batch();
  batch.set(db.doc(`${OBJECTS}/${id}`), built.parent);
  batch.set(db.doc(`${OBJECTS}/${id}/versions/${VERSION}`), built.version);
  if (options.editor) {
    batch.set(db.doc(`${AUDIT}/${importAuditId(id)}`), {
      action: "import",
      actor: options.editor,
      operator: "catalog-import",
      target: { collection: "trainingCatalogObjects", id, contentVersion: VERSION },
      at: "2026-11-15T00:00:00.000Z",
      runId: INITIAL_IMPORT_RUN_ID,
      checksum: built.checksum,
      result: "ok",
    });
  }
  await batch.commit();
}

async function markPublished(db: Firestore, id: string, legacyAttributes?: Record<string, unknown>): Promise<void> {
  const versionSnap = await db.doc(`${OBJECTS}/${id}/versions/${VERSION}`).get();
  const version = versionSnap.data();
  if (!version) throw new Error("missing snapshot");
  const nextLegacy = legacyAttributes ?? version.legacyAttributes ?? {};
  const checksum = computeCatalogChecksum(contentChecksumPayload({
    localeContent: version.localeContent,
    taxonomy: version.taxonomy,
    refs: version.refs,
    legacyAttributes: nextLegacy,
    schemaVersion: version.schemaVersion,
  }));
  const nextVersion = {
    ...version,
    legacyAttributes: nextLegacy,
    checksum,
    status: "published",
    reviewStatus: "approved",
    reviewer: "reviewer-1",
    reviewedAt: "2026-11-26T01:00:00.000Z",
  };
  const reviewedContentSha256 = contentHash(nextVersion);
  const parent = (await db.doc(`${OBJECTS}/${id}`).get()).data() ?? {};
  await db.doc(`${OBJECTS}/${id}/versions/${VERSION}`).set({ ...nextVersion, reviewedContentSha256 });
  await db.doc(`${OBJECTS}/${id}`).set({
    ...parent,
    legacyAttributes: nextLegacy,
    checksum,
    status: "published",
    reviewStatus: "approved",
    reviewer: "reviewer-1",
    reviewedAt: "2026-11-26T01:00:00.000Z",
    publishedVersion: VERSION,
  });
}

describe("catalog review and publish fixes", () => {
  let db: Firestore;
  const ids = ["DR-PUB", "DR-DRAFT", "DR-PENDING", "DR-FLAG", "DR-RACE", "DR-EDIT", "DR-VER", "BL-OK", "BL-DRAFT", "BL-PENDING", "BL-FLAG", "BL-MISS", "BL-VER"];

  beforeAll(() => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
  });

  async function clearIds(): Promise<void> {
    const batch = db.batch();
    for (const id of ids) {
      batch.delete(db.doc(`${OBJECTS}/${id}`));
      batch.delete(db.doc(`${OBJECTS}/${id}/versions/${VERSION}`));
      batch.delete(db.doc(`${AUDIT}/${importAuditId(id)}`));
      batch.delete(db.doc(`${AUDIT}/${editRecordId(id, VERSION)}`));
      batch.delete(db.doc(`${ROOT}/trainingCatalogReleases/rel-${id}-${VERSION}`));
    }
    await batch.commit();
    for (const id of ids) {
      const logs = await db.collection(AUDIT).where("target.id", "==", id).get();
      if (logs.empty) continue;
      const auditBatch = db.batch();
      for (const item of logs.docs) auditBatch.delete(item.ref);
      await auditBatch.commit();
    }
  }

  beforeEach(async () => {
    await clearIds();
  });

  afterAll(async () => {
    if (!db) return;
    await clearIds();
  });

  async function approve(id: string): Promise<void> {
    const version = (await db.doc(`${OBJECTS}/${id}/versions/${VERSION}`).get()).data() ?? {};
    await reviewCatalogVersion(db, {
      objectId: id,
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: contentHash(version),
    }, FLOW);
  }

  it("rejects review when the snapshot changes after the transaction read", async () => {
    await seedDraft(db, "DR-RACE", "drill", { editor: "catalog-import" });
    const version = (await db.doc(`${OBJECTS}/DR-RACE/versions/${VERSION}`).get()).data() ?? {};
    let changed = false;
    const original = db.runTransaction.bind(db);
    const database = db as unknown as {
      runTransaction: (fn: (tx: { get: (ref: { path: string }) => Promise<unknown> }) => Promise<unknown>) => Promise<unknown>;
    };
    database.runTransaction = async (fn) => original(async (tx) => {
      const get = tx.get.bind(tx) as unknown as (ref: { path: string }) => Promise<unknown>;
      const wrapped = tx as unknown as { get: (ref: { path: string }) => Promise<unknown> };
      wrapped.get = async (ref) => {
        const snap = await get(ref);
        if (!changed && ref.path.includes(`/versions/${VERSION}`)) {
          changed = true;
          await db.doc(ref.path).update({
            localeContent: { zh: { name: "raced" }, en: { name: "raced" } },
          });
        }
        return snap;
      };
      return fn(wrapped);
    });
    try {
      await expect(reviewCatalogVersion(db, {
        objectId: "DR-RACE",
        contentVersion: VERSION,
        reviewer: "reviewer-1",
        decision: "approved",
        expectedContentSha256: contentHash(version),
      }, FLOW)).rejects.toThrow(/content changed since review/);
    } finally {
      db.runTransaction = original;
    }
    const saved = (await db.doc(`${OBJECTS}/DR-RACE/versions/${VERSION}`).get()).data();
    expect(saved?.reviewStatus).not.toBe("approved");
    expect(saved?.localeContent).toEqual({ zh: { name: "raced" }, en: { name: "raced" } });
  });

  it("rejects a review whose digest does not match the snapshot", async () => {
    await seedDraft(db, "DR-PUB", "drill", { editor: "catalog-import" });
    await expect(reviewCatalogVersion(db, {
      objectId: "DR-PUB",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: "0".repeat(64),
    }, FLOW)).rejects.toThrow(/content changed since review/);
    expect((await db.doc(`${OBJECTS}/DR-PUB/versions/${VERSION}`).get()).data()?.reviewStatus).toBe("pending");
    const logs = await db.collection(AUDIT).where("target.id", "==", "DR-PUB").get();
    expect(logs.docs.map((item) => item.data()).filter((entry) => entry.action === "review")).toEqual([
      expect.objectContaining({ result: "rejected", operator: "emulator-operator" }),
    ]);
  });

  it("rejects a repeated approval and a reviewer who is the last editor", async () => {
    await seedDraft(db, "DR-PUB", "drill", { editor: "catalog-import" });
    await approve("DR-PUB");
    const approved = (await db.doc(`${OBJECTS}/DR-PUB/versions/${VERSION}`).get()).data() ?? {};
    await expect(reviewCatalogVersion(db, {
      objectId: "DR-PUB",
      contentVersion: VERSION,
      reviewer: "reviewer-2",
      decision: "approved",
      expectedContentSha256: contentHash(approved),
    }, FLOW)).rejects.toThrow(/pending or rejected/);
    expect((await db.doc(`${OBJECTS}/DR-PUB/versions/${VERSION}`).get()).data()?.reviewer).toBe("reviewer-1");

    await seedDraft(db, "DR-EDIT", "drill", { editor: "catalog-import" });
    const version = (await db.doc(`${OBJECTS}/DR-EDIT/versions/${VERSION}`).get()).data() ?? {};
    await expect(reviewCatalogVersion(db, {
      objectId: "DR-EDIT",
      contentVersion: VERSION,
      reviewer: "catalog-import",
      decision: "approved",
      expectedContentSha256: contentHash(version),
    }, FLOW)).rejects.toThrow(/reviewer matches the last editor/);
    expect((await db.doc(`${OBJECTS}/DR-EDIT/versions/${VERSION}`).get()).data()?.reviewStatus).toBe("pending");
  });

  it("uses a version edit record ahead of the import audit", async () => {
    await seedDraft(db, "DR-EDIT", "drill", { editor: "catalog-import" });
    const version = (await db.doc(`${OBJECTS}/DR-EDIT/versions/${VERSION}`).get()).data() ?? {};
    await db.doc(`${AUDIT}/${editRecordId("DR-EDIT", VERSION)}`).set({
      action: "edit",
      actor: "editor-2",
      operator: "editor-2",
      target: { collection: "trainingCatalogObjects", id: "DR-EDIT", contentVersion: VERSION },
      checksum: version.checksum,
      at: "2026-11-26T02:00:00.000Z",
      supersedesAuditId: importAuditId("DR-EDIT"),
    });
    await expect(reviewCatalogVersion(db, {
      objectId: "DR-EDIT",
      contentVersion: VERSION,
      reviewer: "editor-2",
      decision: "approved",
      expectedContentSha256: contentHash(version),
    }, FLOW)).rejects.toThrow(/reviewer matches the last editor/);
    await reviewCatalogVersion(db, {
      objectId: "DR-EDIT",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: contentHash(version),
    }, FLOW);
    expect((await db.doc(`${OBJECTS}/DR-EDIT/versions/${VERSION}`).get()).data()?.reviewer).toBe("reviewer-1");
  });

  it("refuses a production review with no gate context and writes nothing", async () => {
    await seedDraft(db, "DR-PUB", "drill", { editor: "catalog-import" });
    await expect(reviewCatalogVersion(db, {
      objectId: "DR-PUB",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: "abc",
    }, { target: "production" })).rejects.toThrow(/production execution context is required/);
    expect((await db.doc(`${OBJECTS}/DR-PUB/versions/${VERSION}`).get()).data()?.reviewStatus).toBe("pending");
    const logs = await db.collection(AUDIT).where("target.id", "==", "DR-PUB").get();
    expect(logs.docs.filter((item) => item.data().action === "review")).toHaveLength(0);
  });

  it("publishes a block only when every referenced drill is already published", async () => {
    await seedDraft(db, "DR-PUB", "drill", { editor: "catalog-import" });
    await approve("DR-PUB");
    await publishCatalogVersionFlow(db, {
      objectId: "DR-PUB",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW);
    await seedDraft(db, "BL-OK", "block", {
      editor: "catalog-import",
      refs: [{ id: "DR-PUB", contentVersion: VERSION }],
    });
    await approve("BL-OK");
    await publishCatalogVersionFlow(db, {
      objectId: "BL-OK",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW);
    expect((await db.doc(`${OBJECTS}/BL-OK`).get()).data()).toMatchObject({
      status: "published",
      publishedVersion: VERSION,
    });

    await seedDraft(db, "DR-DRAFT", "drill", { editor: "catalog-import" });
    await seedDraft(db, "BL-DRAFT", "block", {
      editor: "catalog-import",
      refs: [{ id: "DR-DRAFT", contentVersion: VERSION }],
    });
    await approve("BL-DRAFT");
    await expect(publishCatalogVersionFlow(db, {
      objectId: "BL-DRAFT",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW)).rejects.toThrow(/referenced drill DR-DRAFT is not published/);
    const draftParent = (await db.doc(`${OBJECTS}/BL-DRAFT`).get()).data();
    expect(draftParent?.status).toBe("draft");
    expect(draftParent?.publishedVersion).toBeUndefined();

    await seedDraft(db, "DR-PENDING", "drill", { editor: "catalog-import" });
    await markPublished(db, "DR-PENDING");
    await db.doc(`${OBJECTS}/DR-PENDING`).update({ reviewStatus: "pending" });
    await seedDraft(db, "BL-PENDING", "block", {
      editor: "catalog-import",
      refs: [{ id: "DR-PENDING", contentVersion: VERSION }],
    });
    await approve("BL-PENDING");
    await expect(publishCatalogVersionFlow(db, {
      objectId: "BL-PENDING",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW)).rejects.toThrow(/reviewStatus is not approved/);
    expect((await db.doc(`${OBJECTS}/BL-PENDING`).get()).data()?.status).toBe("draft");

    await seedDraft(db, "DR-FLAG", "drill", { editor: "catalog-import" });
    await markPublished(db, "DR-FLAG", { safetyFlag: "review_required" });
    await seedDraft(db, "BL-FLAG", "block", {
      editor: "catalog-import",
      refs: [{ id: "DR-FLAG", contentVersion: VERSION }],
    });
    await approve("BL-FLAG");
    await expect(publishCatalogVersionFlow(db, {
      objectId: "BL-FLAG",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW)).rejects.toThrow(/safetyFlag review_required blocks publish: DR-FLAG/);
    expect((await db.doc(`${OBJECTS}/BL-FLAG`).get()).data()?.publishedVersion).toBeUndefined();

    await seedDraft(db, "BL-MISS", "block", {
      editor: "catalog-import",
      refs: [{ id: "DR-MISSING", contentVersion: VERSION }],
    });
    await approve("BL-MISS");
    await expect(publishCatalogVersionFlow(db, {
      objectId: "BL-MISS",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW)).rejects.toThrow(/referenced drill DR-MISSING does not exist/);
    expect((await db.doc(`${OBJECTS}/BL-MISS`).get()).data()?.status).toBe("draft");

    await seedDraft(db, "DR-VER", "drill", { editor: "catalog-import" });
    await approve("DR-VER");
    await publishCatalogVersionFlow(db, {
      objectId: "DR-VER",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW);
    await seedDraft(db, "BL-VER", "block", {
      editor: "catalog-import",
      refs: [{ id: "DR-VER", contentVersion: "v9" }],
    });
    await approve("BL-VER");
    await expect(publishCatalogVersionFlow(db, {
      objectId: "BL-VER",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW)).rejects.toThrow(/referenced drill DR-VER contentVersion does not match/);
    expect((await db.doc(`${OBJECTS}/BL-VER`).get()).data()?.status).toBe("draft");
  });
});
