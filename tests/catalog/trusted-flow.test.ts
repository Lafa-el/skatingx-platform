import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, FieldValue, getFirestore } from "firebase-admin/firestore";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CatalogKind } from "@skatingx/schema";
import {
  type CatalogObject,
  type CatalogVersion,
  canonicalCatalogJson,
  checkPublishedBinding,
  contentChecksumPayload,
} from "@skatingx/training-catalog";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum";
import {
  assertCatalogProject,
  publishCatalogLink,
  publishCatalogVersionFlow,
  reviewCatalogLink,
  reviewCatalogVersion,
  revokeCatalogApprovalFlow,
  withdrawCatalogLink,
  withdrawCatalogVersion,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const RELEASES = `${ROOT}/trainingCatalogReleases`;
const LINKS = `${ROOT}/trainingCatalogLinks`;
const PUBLIC_LINKS = `${ROOT}/trainingCatalogPublicLinks`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const CONTENT_VERSION = "v1";
const STARTED = "2026-11-13T00:00:00.000Z";

const CATALOG_COLLECTIONS = [
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
] as const;

function emulatorAddress(): { host: string; port: number } {
  const raw = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  const colon = raw.lastIndexOf(":");
  return { host: raw.slice(0, colon), port: Number(raw.slice(colon + 1)) };
}

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-trusted-flow");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-trusted-flow");
  return getFirestore(app);
}

function pair(options: {
  id: string;
  kind: CatalogKind;
  legacyAttributes?: Record<string, unknown>;
  parentStatus?: CatalogObject["status"];
  snapshotStatus?: CatalogVersion["status"];
  reviewStatus?: CatalogVersion["reviewStatus"];
  reviewer?: string;
  reviewedAt?: string;
}): { parent: CatalogObject; version: CatalogVersion } {
  const content = {
    localeContent: { zh: { name: options.id }, en: { name: options.id } },
    taxonomy: { objectiveIds: [] as string[] },
    refs: [] as CatalogObject["refs"],
    legacyAttributes: options.legacyAttributes ?? {},
    schemaVersion: 1,
  };
  const checksum = computeCatalogChecksum(contentChecksumPayload(content));
  const review = {
    ...(options.reviewer ? { reviewer: options.reviewer } : {}),
    ...(options.reviewedAt ? { reviewedAt: options.reviewedAt } : {}),
  };
  const version: CatalogVersion = {
    ...content,
    contentVersion: CONTENT_VERSION,
    status: options.snapshotStatus ?? "draft",
    reviewStatus: options.reviewStatus ?? "pending",
    checksum,
    ...review,
  };
  const parent: CatalogObject = {
    id: options.id,
    kind: options.kind,
    sportId: "short_track",
    ...content,
    contentVersion: CONTENT_VERSION,
    status: options.parentStatus ?? "draft",
    reviewStatus: options.reviewStatus ?? "pending",
    checksum,
    createdAt: STARTED,
    updatedAt: STARTED,
    ...review,
  };
  return { parent, version };
}

async function seedObject(
  db: Firestore,
  options: Parameters<typeof pair>[0] & { editor?: string },
): Promise<void> {
  const { parent, version } = pair(options);
  const batch = db.batch();
  batch.set(db.doc(`${OBJECTS}/${options.id}`), parent);
  batch.set(db.doc(`${OBJECTS}/${options.id}/versions/${CONTENT_VERSION}`), version);
  if (options.editor) {
    batch.set(db.collection(AUDIT).doc(), {
      action: "edit",
      actor: options.editor,
      target: { collection: "trainingCatalogObjects", id: options.id },
      at: STARTED,
      result: "ok",
    });
  }
  await batch.commit();
}

async function wipe(db: Firestore): Promise<void> {
  const paths: string[] = [];
  for (const name of CATALOG_COLLECTIONS) {
    const snap = await db.collection(`${ROOT}/${name}`).get();
    for (const item of snap.docs) paths.push(item.ref.path);
  }
  const parents = await db.collection(`${ROOT}/trainingCatalogObjects`).get();
  for (const parent of parents.docs) {
    const versions = await db.collection(`${parent.ref.path}/versions`).get();
    for (const item of versions.docs) paths.push(item.ref.path);
  }
  const unique = [...new Set(paths)];
  for (let index = 0; index < unique.length; index += 400) {
    const batch = db.batch();
    for (const docPath of unique.slice(index, index + 400)) batch.delete(db.doc(docPath));
    await batch.commit();
  }
}

async function audits(db: Firestore, id: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(AUDIT).where("target.id", "==", id).get();
  return snap.docs.map((item) => item.data());
}

describe.sequential("trusted catalog review and publish", () => {
  let db: Firestore;

  beforeAll(async () => {
    expect(PROJECT_ID.startsWith("demo-")).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
    await wipe(db);
    await seedObject(db, { id: "EX-REVIEW", kind: "exercise", editor: "editor-1" });
    await seedObject(db, { id: "EX-PUB", kind: "exercise", editor: "editor-1" });
    await seedObject(db, { id: "EX-UNREV", kind: "exercise", editor: "editor-1" });
    await seedObject(db, { id: "EX-SUM", kind: "exercise", editor: "editor-1" });
    await seedObject(db, { id: "EX-SAME", kind: "exercise", editor: "same-person" });
    await seedObject(db, { id: "EX-NOLOG", kind: "exercise" });
    await seedObject(db, {
      id: "EX-L039",
      kind: "exercise",
      editor: "editor-1",
      legacyAttributes: {
        youthDefault: "Conditional",
        supervision: "Qualified adult/coach",
        safetyFlag: "review_required",
      },
    });
    await seedObject(db, { id: "DR-P23", kind: "drill", editor: "editor-1" });
    await seedObject(db, { id: "EX-WD", kind: "exercise", editor: "editor-1" });
    await seedObject(db, {
      id: "EX-REVOKE",
      kind: "exercise",
      parentStatus: "approved",
      snapshotStatus: "approved",
      reviewStatus: "approved",
      reviewer: "reviewer-1",
      reviewedAt: "2026-11-13T01:00:00.000Z",
    });
    await seedObject(db, { id: "EX-LINK", kind: "exercise", editor: "editor-1" });
    await db.doc(`${LINKS}/academy-p23`).set({
      catalogRef: { kind: "exercise", id: "EX-LINK", contentVersion: CONTENT_VERSION },
      reviewStatus: "pending",
    });
  });

  afterAll(async () => {
    if (db) await wipe(db);
  });

  it("refuses a project id that does not start with demo-", () => {
    expect(() => assertCatalogProject("skatingx-prod")).toThrow(/demo-/);
  });

  it("reviews a draft snapshot and refuses an empty or repeated approval", async () => {
    const before = (await db.doc(`${OBJECTS}/EX-REVIEW`).get()).data();
    await expect(
      reviewCatalogVersion(db, {
        objectId: "EX-REVIEW",
        contentVersion: CONTENT_VERSION,
        reviewer: "   ",
        decision: "approved",
      }),
    ).rejects.toThrow(/reviewer is required/);

    await reviewCatalogVersion(db, {
      objectId: "EX-REVIEW",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-1",
      decision: "rejected",
    });
    const rejected = (await db.doc(`${OBJECTS}/EX-REVIEW/versions/${CONTENT_VERSION}`).get()).data();
    expect(rejected?.reviewStatus).toBe("rejected");
    expect(rejected?.reviewer).toBe("reviewer-1");
    expect(rejected?.status).toBe("draft");

    await reviewCatalogVersion(db, {
      objectId: "EX-REVIEW",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-2",
      decision: "approved",
    });
    const approved = (await db.doc(`${OBJECTS}/EX-REVIEW/versions/${CONTENT_VERSION}`).get()).data();
    expect(approved?.reviewStatus).toBe("approved");
    expect(approved?.reviewer).toBe("reviewer-2");
    expect(typeof approved?.reviewedAt).toBe("string");
    expect(canonicalCatalogJson((await db.doc(`${OBJECTS}/EX-REVIEW`).get()).data())).toBe(
      canonicalCatalogJson(before),
    );

    await expect(
      reviewCatalogVersion(db, {
        objectId: "EX-REVIEW",
        contentVersion: CONTENT_VERSION,
        reviewer: "reviewer-3",
        decision: "approved",
      }),
    ).rejects.toThrow(/pending or rejected/);
    const still = (await db.doc(`${OBJECTS}/EX-REVIEW/versions/${CONTENT_VERSION}`).get()).data();
    expect(still?.reviewer).toBe("reviewer-2");
    const reviewLogs = (await audits(db, "EX-REVIEW")).filter((entry) => entry.action === "review");
    expect(reviewLogs.some((entry) => entry.result === "ok" && entry.detail === "approved")).toBe(true);
    expect(reviewLogs.some((entry) => entry.result === "rejected")).toBe(true);
  });

  it("publishes a reviewed version and keeps the stored review record", async () => {
    await reviewCatalogVersion(db, {
      objectId: "EX-PUB",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
    });
    await publishCatalogVersionFlow(db, {
      objectId: "EX-PUB",
      contentVersion: CONTENT_VERSION,
      reviewer: "publisher-1",
      notes: "first publish",
    });

    const parent = (await db.doc(`${OBJECTS}/EX-PUB`).get()).data() ?? {};
    const version = (await db.doc(`${OBJECTS}/EX-PUB/versions/${CONTENT_VERSION}`).get()).data() ?? {};
    const release = (await db.doc(`${RELEASES}/rel-EX-PUB-${CONTENT_VERSION}`).get()).data() ?? {};
    expect(parent.status).toBe("published");
    expect(parent.publishedVersion).toBe(CONTENT_VERSION);
    expect(parent.contentVersion).toBe(CONTENT_VERSION);
    expect(parent.reviewer).toBe("reviewer-1");
    expect(parent.reviewStatus).toBe("approved");
    expect(parent.reviewedAt).toBe(version.reviewedAt);
    expect(version.status).toBe("published");
    expect(version.reviewer).toBe("reviewer-1");
    expect(version.checksum).toBe(parent.checksum);
    expect(canonicalCatalogJson({
      localeContent: parent.localeContent,
      taxonomy: parent.taxonomy,
      refs: parent.refs,
      legacyAttributes: parent.legacyAttributes,
    })).toBe(canonicalCatalogJson({
      localeContent: version.localeContent,
      taxonomy: version.taxonomy,
      refs: version.refs,
      legacyAttributes: version.legacyAttributes,
    }));
    expect(checkPublishedBinding(parent as unknown as CatalogObject, version as unknown as CatalogVersion)).toEqual([]);
    expect(release).toMatchObject({
      objectId: "EX-PUB",
      contentVersion: CONTENT_VERSION,
      publishedVersion: CONTENT_VERSION,
      checksum: version.checksum,
      status: "published",
      reviewStatus: "approved",
      reviewer: "reviewer-1",
      reviewedAt: version.reviewedAt,
      notes: "first publish",
    });
    const publishLogs = (await audits(db, "EX-PUB")).filter((entry) => entry.action === "publish" && entry.result === "ok");
    expect(publishLogs).toHaveLength(1);
    expect(publishLogs[0]?.actor).toBe("publisher-1");

    const { host, port } = emulatorAddress();
    const rules = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host, port } });
    try {
      const reader = rules.authenticatedContext("reader").firestore();
      await assertSucceeds(getDoc(doc(reader, `${OBJECTS}/EX-PUB`)));
      await assertFails(getDoc(doc(reader, `${OBJECTS}/DR-P23`)));
      await assertSucceeds(getDoc(doc(reader, `${RELEASES}/rel-EX-PUB-${CONTENT_VERSION}`)));
    } finally {
      await rules.cleanup();
    }
  });

  it("rejects publish when review, checksum, editor, audit, or safety flag fails", async () => {
    await expect(
      publishCatalogVersionFlow(db, {
        objectId: "EX-UNREV",
        contentVersion: CONTENT_VERSION,
        reviewer: "publisher-1",
      }),
    ).rejects.toThrow(/reviewStatus approved/);

    await reviewCatalogVersion(db, {
      objectId: "EX-SUM",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
    });
    await db.doc(`${OBJECTS}/EX-SUM/versions/${CONTENT_VERSION}`).update({ checksum: "tampered" });
    await expect(
      publishCatalogVersionFlow(db, {
        objectId: "EX-SUM",
        contentVersion: CONTENT_VERSION,
        reviewer: "publisher-1",
      }),
    ).rejects.toThrow(/checksum does not match/);

    await reviewCatalogVersion(db, {
      objectId: "EX-SAME",
      contentVersion: CONTENT_VERSION,
      reviewer: "same-person",
      decision: "approved",
    });
    await expect(
      publishCatalogVersionFlow(db, {
        objectId: "EX-SAME",
        contentVersion: CONTENT_VERSION,
        reviewer: "publisher-1",
      }),
    ).rejects.toThrow(/last editor/);

    await reviewCatalogVersion(db, {
      objectId: "EX-NOLOG",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
    });
    await expect(
      publishCatalogVersionFlow(db, {
        objectId: "EX-NOLOG",
        contentVersion: CONTENT_VERSION,
        reviewer: "publisher-1",
      }),
    ).rejects.toThrow(/no create, edit, or import/);

    await reviewCatalogVersion(db, {
      objectId: "EX-L039",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
    });
    await expect(
      publishCatalogVersionFlow(db, {
        objectId: "EX-L039",
        contentVersion: CONTENT_VERSION,
        reviewer: "publisher-1",
      }),
    ).rejects.toThrow(/review_required/);

    for (const id of ["EX-UNREV", "EX-SUM", "EX-SAME", "EX-NOLOG", "EX-L039"]) {
      const rejected = (await audits(db, id)).filter((entry) => entry.action === "publish" && entry.result === "rejected");
      expect(rejected.length).toBeGreaterThan(0);
      const parent = (await db.doc(`${OBJECTS}/${id}`).get()).data();
      expect(parent?.status).not.toBe("published");
      expect((await db.doc(`${RELEASES}/rel-${id}-${CONTENT_VERSION}`).get()).exists).toBe(false);
    }
  });

  it("does not write again when the same version is published twice", async () => {
    const beforeParent = canonicalCatalogJson((await db.doc(`${OBJECTS}/EX-PUB`).get()).data());
    const beforeVersion = canonicalCatalogJson((await db.doc(`${OBJECTS}/EX-PUB/versions/${CONTENT_VERSION}`).get()).data());
    const beforeRelease = canonicalCatalogJson((await db.doc(`${RELEASES}/rel-EX-PUB-${CONTENT_VERSION}`).get()).data());
    await publishCatalogVersionFlow(db, {
      objectId: "EX-PUB",
      contentVersion: CONTENT_VERSION,
      reviewer: "publisher-1",
      notes: "second publish",
    });
    expect(canonicalCatalogJson((await db.doc(`${OBJECTS}/EX-PUB`).get()).data())).toBe(beforeParent);
    expect(canonicalCatalogJson((await db.doc(`${OBJECTS}/EX-PUB/versions/${CONTENT_VERSION}`).get()).data())).toBe(beforeVersion);
    expect(canonicalCatalogJson((await db.doc(`${RELEASES}/rel-EX-PUB-${CONTENT_VERSION}`).get()).data())).toBe(beforeRelease);
    const releases = await db.collection(RELEASES).where("objectId", "==", "EX-PUB").get();
    expect(releases.size).toBe(1);
    const success = (await audits(db, "EX-PUB")).filter((entry) => entry.action === "publish" && entry.result === "ok");
    expect(success).toHaveLength(1);
  });

  it("withdraws a published version without changing the snapshot", async () => {
    await reviewCatalogVersion(db, {
      objectId: "EX-WD",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
    });
    await publishCatalogVersionFlow(db, {
      objectId: "EX-WD",
      contentVersion: CONTENT_VERSION,
      reviewer: "publisher-1",
    });
    const beforeVersion = canonicalCatalogJson((await db.doc(`${OBJECTS}/EX-WD/versions/${CONTENT_VERSION}`).get()).data());
    await withdrawCatalogVersion(db, { objectId: "EX-WD", contentVersion: CONTENT_VERSION, actor: "operator-1" });
    const parent = (await db.doc(`${OBJECTS}/EX-WD`).get()).data();
    expect(parent?.status).toBe("deprecated");
    expect(parent?.publishedVersion).toBeUndefined();
    expect(canonicalCatalogJson((await db.doc(`${OBJECTS}/EX-WD/versions/${CONTENT_VERSION}`).get()).data())).toBe(beforeVersion);

    const { host, port } = emulatorAddress();
    const rules = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host, port } });
    try {
      const reader = rules.authenticatedContext("reader-withdraw").firestore();
      await assertFails(getDoc(doc(reader, `${OBJECTS}/EX-WD/versions/${CONTENT_VERSION}`)));
    } finally {
      await rules.cleanup();
    }
  });

  it("revokes an approved unpublished object and its snapshot together", async () => {
    await revokeCatalogApprovalFlow(db, { objectId: "EX-REVOKE", contentVersion: CONTENT_VERSION, actor: "operator-1" });
    const parent = (await db.doc(`${OBJECTS}/EX-REVOKE`).get()).data();
    const version = (await db.doc(`${OBJECTS}/EX-REVOKE/versions/${CONTENT_VERSION}`).get()).data();
    expect(parent?.status).toBe("draft");
    expect(parent?.reviewStatus).toBe("pending");
    expect(parent?.reviewer).toBeUndefined();
    expect(parent?.reviewedAt).toBeUndefined();
    expect(version?.status).toBe("draft");
    expect(version?.reviewStatus).toBe("pending");
    expect(version?.reviewer).toBeUndefined();
    expect(version?.reviewedAt).toBeUndefined();
    const logs = (await audits(db, "EX-REVOKE")).filter((entry) => entry.action === "revoke" && entry.result === "ok");
    expect(logs).toHaveLength(1);
  });

  it("publishes a link projection only after the target is published, then withdraws it", async () => {
    await reviewCatalogLink(db, { academyItemId: "academy-p23", reviewer: "reviewer-1", decision: "approved" });
    await expect(publishCatalogLink(db, { academyItemId: "academy-p23", actor: "publisher-1" })).rejects.toThrow(
      /not published/,
    );
    expect((await db.doc(`${PUBLIC_LINKS}/academy-p23`).get()).exists).toBe(false);

    await reviewCatalogVersion(db, {
      objectId: "EX-LINK",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
    });
    await publishCatalogVersionFlow(db, {
      objectId: "EX-LINK",
      contentVersion: CONTENT_VERSION,
      reviewer: "publisher-1",
    });
    const releasesBefore = (await db.collection(RELEASES).get()).size;
    await publishCatalogLink(db, { academyItemId: "academy-p23", actor: "publisher-1" });
    const projection = (await db.doc(`${PUBLIC_LINKS}/academy-p23`).get()).data() ?? {};
    expect(Object.keys(projection)).toEqual(["catalogRef"]);
    expect(Object.keys(projection.catalogRef as object).sort()).toEqual(["contentVersion", "id", "kind"]);
    expect(projection.catalogRef).toEqual({ kind: "exercise", id: "EX-LINK", contentVersion: CONTENT_VERSION });
    expect((await db.collection(RELEASES).get()).size).toBe(releasesBefore);

    await withdrawCatalogLink(db, { academyItemId: "academy-p23", actor: "operator-1" });
    expect((await db.doc(`${PUBLIC_LINKS}/academy-p23`).get()).exists).toBe(false);
    expect((await db.doc(`${LINKS}/academy-p23`).get()).exists).toBe(true);
  });

  it("approves a link that has no reviewStatus and rejects null or illegal values", async () => {
    const catalogRef = { kind: "exercise", id: "EX-PUB", contentVersion: CONTENT_VERSION };
    await db.doc(`${LINKS}/academy-implicit`).set({ catalogRef });
    await reviewCatalogLink(db, {
      academyItemId: "academy-implicit",
      reviewer: "reviewer-1",
      decision: "approved",
    });
    const approved = (await db.doc(`${LINKS}/academy-implicit`).get()).data();
    expect(approved?.reviewStatus).toBe("approved");
    expect(approved?.reviewer).toBe("reviewer-1");
    expect(typeof approved?.reviewedAt).toBe("string");

    for (const [id, reviewStatus] of [
      ["academy-null", null],
      ["academy-empty", ""],
      ["academy-other", "published"],
    ] as const) {
      await db.doc(`${LINKS}/${id}`).set({ catalogRef, reviewStatus });
      await expect(
        reviewCatalogLink(db, { academyItemId: id, reviewer: "reviewer-1", decision: "approved" }),
      ).rejects.toThrow(/pending or rejected/);
      const stored = (await db.doc(`${LINKS}/${id}`).get()).data();
      expect(stored?.reviewer).toBeUndefined();
      expect(stored?.reviewedAt).toBeUndefined();
    }
  });

  it("does not publish a link when the in-transaction read shows the review was revoked", async () => {
    await db.doc(`${LINKS}/academy-race`).set({
      catalogRef: { kind: "exercise", id: "EX-PUB", contentVersion: CONTENT_VERSION },
      reviewStatus: "approved",
      reviewer: "reviewer-1",
      reviewedAt: STARTED,
    });
    expect((await db.doc(`${PUBLIC_LINKS}/academy-race`).get()).exists).toBe(false);
    const original = db.runTransaction.bind(db);
    db.runTransaction = async (updateFunction) => {
      await db.doc(`${LINKS}/academy-race`).update({
        reviewStatus: "pending",
        reviewer: FieldValue.delete(),
        reviewedAt: FieldValue.delete(),
      });
      return original(updateFunction);
    };
    try {
      await expect(publishCatalogLink(db, { academyItemId: "academy-race", actor: "publisher-1" })).rejects.toThrow(
        /not approved/,
      );
    } finally {
      db.runTransaction = original;
    }
    expect((await db.doc(`${PUBLIC_LINKS}/academy-race`).get()).exists).toBe(false);
    const success = (await audits(db, "academy-race")).filter(
      (entry) => entry.action === "link_publish" && entry.result === "ok",
    );
    expect(success).toHaveLength(0);
  });

  it("writes a rejected audit when withdraw, revoke, or link withdraw fails to commit", async () => {
    await seedObject(db, {
      id: "EX-COMMIT-W",
      kind: "exercise",
      parentStatus: "published",
      reviewStatus: "approved",
      reviewer: "reviewer-1",
      reviewedAt: STARTED,
    });
    await db.doc(`${OBJECTS}/EX-COMMIT-W`).update({ publishedVersion: CONTENT_VERSION });
    const originalRun = db.runTransaction.bind(db);
    db.runTransaction = async () => {
      throw new Error("withdraw commit failed");
    };
    try {
      await expect(
        withdrawCatalogVersion(db, { objectId: "EX-COMMIT-W", contentVersion: CONTENT_VERSION, actor: "operator-1" }),
      ).rejects.toThrow(/withdraw commit failed/);
    } finally {
      db.runTransaction = originalRun;
    }
    expect((await db.doc(`${OBJECTS}/EX-COMMIT-W`).get()).data()?.status).toBe("published");
    expect(
      (await audits(db, "EX-COMMIT-W")).some(
        (entry) => entry.action === "withdraw" && entry.result === "rejected" && entry.detail === "withdraw commit failed",
      ),
    ).toBe(true);

    await seedObject(db, {
      id: "EX-COMMIT-R",
      kind: "exercise",
      parentStatus: "approved",
      snapshotStatus: "approved",
      reviewStatus: "approved",
      reviewer: "reviewer-1",
      reviewedAt: STARTED,
    });
    const originalBatch = db.batch.bind(db);
    db.batch = () => {
      const batch = originalBatch();
      batch.commit = async () => {
        throw new Error("revoke commit failed");
      };
      return batch;
    };
    try {
      await expect(
        revokeCatalogApprovalFlow(db, { objectId: "EX-COMMIT-R", contentVersion: CONTENT_VERSION, actor: "operator-1" }),
      ).rejects.toThrow(/revoke commit failed/);
    } finally {
      db.batch = originalBatch;
    }
    expect((await db.doc(`${OBJECTS}/EX-COMMIT-R`).get()).data()?.status).toBe("approved");
    expect(
      (await audits(db, "EX-COMMIT-R")).some(
        (entry) => entry.action === "revoke" && entry.result === "rejected" && entry.detail === "revoke commit failed",
      ),
    ).toBe(true);

    await db.doc(`${PUBLIC_LINKS}/academy-commit`).set({
      catalogRef: { kind: "exercise", id: "EX-PUB", contentVersion: CONTENT_VERSION },
    });
    db.runTransaction = async () => {
      throw new Error("link withdraw commit failed");
    };
    try {
      await expect(withdrawCatalogLink(db, { academyItemId: "academy-commit", actor: "operator-1" })).rejects.toThrow(
        /link withdraw commit failed/,
      );
    } finally {
      db.runTransaction = originalRun;
    }
    expect((await db.doc(`${PUBLIC_LINKS}/academy-commit`).get()).exists).toBe(true);
    expect(
      (await audits(db, "academy-commit")).some(
        (entry) =>
          entry.action === "link_withdraw" && entry.result === "rejected" && entry.detail === "link withdraw commit failed",
      ),
    ).toBe(true);
  });
});
