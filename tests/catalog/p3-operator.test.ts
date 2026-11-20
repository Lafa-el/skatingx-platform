import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentHash, publishKnowledgeArticle, reviewKnowledgeArticle } from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const ARTICLES = `${ROOT}/trainingCatalogKnowledgeArticles`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const REVIEWER = "reviewer-1";
const ACTOR = "publisher-1";
const OPERATOR = "op-1";
const OWN_IDS = ["KA-OP-REVIEW", "KA-OP-PUBLISH", "KA-OP-BARE", "KA-OP-MISSING"];

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-p3-operator");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-p3-operator");
  return getFirestore(app);
}

async function seedDraft(db: Firestore, id: string): Promise<void> {
  await db.doc(`${ARTICLES}/${id}`).set({
    id,
    status: "draft",
    reviewStatus: "pending",
    titleZh: "操作者绑定",
    bodyZh: "正文",
  });
}

async function audits(db: Firestore, id: string, action: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(AUDIT).where("target.id", "==", id).get();
  return snap.docs.map((item) => item.data()).filter((entry) => entry.action === action);
}

async function removeOwnDocuments(db: Firestore): Promise<void> {
  const batch = db.batch();
  for (const id of OWN_IDS) batch.delete(db.doc(`${ARTICLES}/${id}`));
  const logs = await db.collection(AUDIT).where("target.id", "in", OWN_IDS).get();
  for (const item of logs.docs) batch.delete(item.ref);
  await batch.commit();
}

describe("P3 operator binding on M4 audits", () => {
  let db: Firestore;

  beforeAll(async () => {
    expect(PROJECT_ID.startsWith("demo-")).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
    await removeOwnDocuments(db);
  });

  afterAll(async () => {
    if (db) await removeOwnDocuments(db);
  });

  it("records the operator on an approved review", async () => {
    await seedDraft(db, "KA-OP-REVIEW");
    const digest = contentHash((await db.doc(`${ARTICLES}/KA-OP-REVIEW`).get()).data() ?? {});
    await reviewKnowledgeArticle(
      db,
      {
        articleId: "KA-OP-REVIEW",
        reviewer: REVIEWER,
        decision: "approved",
        expectedContentSha256: digest,
      },
      { operator: OPERATOR },
    );

    const article = (await db.doc(`${ARTICLES}/KA-OP-REVIEW`).get()).data();
    const ok = (await audits(db, "KA-OP-REVIEW", "article_review")).filter((entry) => entry.result === "ok");
    expect(ok).toEqual([
      expect.objectContaining({
        action: "article_review",
        actor: REVIEWER,
        operator: OPERATOR,
        result: "ok",
        detail: "approved",
        reviewedContentSha256: digest,
      }),
    ]);
    expect(article?.reviewedContentSha256).toBe(digest);
  });

  it("records the operator on a publish", async () => {
    await seedDraft(db, "KA-OP-PUBLISH");
    await reviewKnowledgeArticle(db, {
      articleId: "KA-OP-PUBLISH",
      reviewer: REVIEWER,
      decision: "approved",
      expectedContentSha256: contentHash((await db.doc(`${ARTICLES}/KA-OP-PUBLISH`).get()).data() ?? {}),
    });
    await publishKnowledgeArticle(
      db,
      { articleId: "KA-OP-PUBLISH", actor: ACTOR },
      { operator: OPERATOR },
    );

    const ok = (await audits(db, "KA-OP-PUBLISH", "article_publish")).filter((entry) => entry.result === "ok");
    expect(ok).toEqual([
      expect.objectContaining({
        action: "article_publish",
        actor: ACTOR,
        operator: OPERATOR,
        result: "ok",
      }),
    ]);
  });

  it("omits operator when a review is called without options", async () => {
    await seedDraft(db, "KA-OP-BARE");
    await reviewKnowledgeArticle(db, {
      articleId: "KA-OP-BARE",
      reviewer: REVIEWER,
      decision: "approved",
      expectedContentSha256: contentHash((await db.doc(`${ARTICLES}/KA-OP-BARE`).get()).data() ?? {}),
    });

    const ok = (await audits(db, "KA-OP-BARE", "article_review")).filter((entry) => entry.result === "ok");
    expect(ok).toHaveLength(1);
    expect(ok[0]).not.toHaveProperty("operator");
    expect(ok[0]?.actor).toBe(REVIEWER);
  });

  it("records the operator on a rejected review of a missing article", async () => {
    await expect(reviewKnowledgeArticle(
      db,
      {
        articleId: "KA-OP-MISSING",
        reviewer: REVIEWER,
        decision: "approved",
        expectedContentSha256: contentHash({}),
      },
      { operator: OPERATOR },
    )).rejects.toThrow(/document does not exist/);

    const rejected = (await audits(db, "KA-OP-MISSING", "article_review")).filter((entry) => entry.result === "rejected");
    expect(rejected).toEqual([
      expect.objectContaining({
        action: "article_review",
        actor: REVIEWER,
        operator: OPERATOR,
        result: "rejected",
      }),
    ]);
    expect(rejected[0]).not.toHaveProperty("reviewedContentSha256");
  });
});
