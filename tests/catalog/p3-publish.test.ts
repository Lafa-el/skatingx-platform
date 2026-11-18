import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseSafetyPolicy } from "@skatingx/training-catalog";
import {
  publishKnowledgeArticle,
  publishSafetyPolicy,
  reviewKnowledgeArticle,
  reviewSafetyPolicy,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const ARTICLES = `${ROOT}/trainingCatalogKnowledgeArticles`;
const POLICIES = `${ROOT}/trainingCatalogSafetyPolicies`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const CREATED = "2026-11-17T00:00:00.000Z";
const REVIEWER = "reviewer-1";
const ACTOR = "publisher-1";

const SOURCES = [
  {
    type: "official_rule",
    id: "ISU-ST-2026",
    title: "ISU Short Track Sport Rules 2026",
    url: "https://isudam.blob.core.windows.net/isudamcontainer/2026-Short-Track-Sport-Rules-20260513-FINAL-as-of-1-June-2026-1780065543-3994.pdf",
    refs: ["Rule 280", "Rule 286", "Rule 288", "Rule 294"],
    verifiedAt: "2026-11-17",
  },
  {
    type: "official_rule",
    id: "USS-ST-2026-27",
    title: "US Speedskating Short Track Rules & Regulations 2026-2027 V1",
    url: "https://assets.contentstack.io/v3/assets/blteb7d012fc7ebef7f/blt1543057d67b57617/6aa08e5137d7f3733b8eb4c2/2026-27_ST_Regs_V1.pdf",
    refs: ["§1.A", "§1.J", "§1.K"],
    verifiedAt: "2026-11-17",
  },
];

const ARTICLE = {
  id: "KA-PREICE-001",
  status: "draft",
  reviewStatus: "pending",
  schemaVersion: 1,
  titleZh: "青少年短道上冰前的装备与场地检查",
  titleEn: "Youth Short Track Pre-Ice Equipment and Venue Check",
  bodyZh: "上冰前核对头盔、防切割手套、护具、冰刀和场地。",
  bodyEn: "Before ice, check the helmet, cut-resistant gloves, protection, skates, and the venue.",
  category: "safety",
  sources: SOURCES,
  catalogRefs: [] as string[],
  createdAt: CREATED,
  updatedAt: CREATED,
};

const POLICY_CONTENT = {
  policyId: "synth-pub-1",
  policyVersion: "synth-pub-1",
  objectIds: ["EX-L001"],
  ageBands: ["age11_13"],
  blockingRestrictions: [] as string[],
  blockingRecoveryFlags: [] as string[],
};

const ARTICLE_IDS = [
  "KA-PREICE-001",
  "KA-PREICE-PENDING",
  "KA-PREICE-PUBLISHED",
  "KA-PREICE-REJECTED",
  "KA-MISSING",
];
const POLICY_IDS = ["synth-pub-1"];

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-p3-publish");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-p3-publish");
  return getFirestore(app);
}

async function seedArticle(db: Firestore, article: { id: string } & Record<string, unknown>): Promise<void> {
  await db.doc(`${ARTICLES}/${article.id}`).set(article);
}

async function readArticle(db: Firestore, id: string): Promise<Record<string, unknown> | undefined> {
  return (await db.doc(`${ARTICLES}/${id}`).get()).data();
}

async function seedPolicy(db: Firestore, policy: { policyId: string } & Record<string, unknown>): Promise<void> {
  await db.doc(`${POLICIES}/${policy.policyId}`).set(policy);
}

async function readPolicy(db: Firestore, id: string): Promise<Record<string, unknown> | undefined> {
  return (await db.doc(`${POLICIES}/${id}`).get()).data();
}

async function audits(db: Firestore, id: string, action: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(AUDIT).where("target.id", "==", id).get();
  return snap.docs.map((item) => item.data()).filter((entry) => entry.action === action);
}

function parseableDate(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function removeOwnDocuments(db: Firestore): Promise<void> {
  const batch = db.batch();
  for (const id of ARTICLE_IDS) batch.delete(db.doc(`${ARTICLES}/${id}`));
  for (const id of POLICY_IDS) batch.delete(db.doc(`${POLICIES}/${id}`));
  const logs = await db.collection(AUDIT).where("target.id", "in", [...ARTICLE_IDS, ...POLICY_IDS]).get();
  for (const item of logs.docs) batch.delete(item.ref);
  await batch.commit();
}

describe("P3 knowledge article and safety policy publish on the emulator", () => {
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

  it("F reviews and publishes KA-PREICE-001 without changing its content", async () => {
    await seedArticle(db, ARTICLE);
    await reviewKnowledgeArticle(db, {
      articleId: "KA-PREICE-001",
      reviewer: REVIEWER,
      decision: "approved",
    });
    const reviewed = await readArticle(db, "KA-PREICE-001");

    await publishKnowledgeArticle(db, { articleId: "KA-PREICE-001", actor: ACTOR });

    const article = await readArticle(db, "KA-PREICE-001");
    expect(article?.status).toBe("published");
    expect(article?.reviewStatus).toBe("approved");
    expect(article?.reviewer).toBe(reviewed?.reviewer);
    expect(article?.reviewedAt).toBe(reviewed?.reviewedAt);
    expect(article?.reviewer).toBe(REVIEWER);
    expect(parseableDate(article?.reviewedAt)).toBe(true);
    expect(parseableDate(article?.publishedAt)).toBe(true);
    expect(article?.titleZh).toBe(ARTICLE.titleZh);
    expect(article?.bodyZh).toBe(ARTICLE.bodyZh);
    expect(article?.sources).toEqual(ARTICLE.sources);
    expect(article?.catalogRefs).toEqual([]);

    const published = (await audits(db, "KA-PREICE-001", "article_publish")).filter((entry) => entry.result === "ok");
    expect(published).toEqual([
      expect.objectContaining({
        action: "article_publish",
        actor: ACTOR,
        result: "ok",
        target: { collection: "trainingCatalogKnowledgeArticles", id: "KA-PREICE-001" },
      }),
    ]);
  });

  it("G refuses to publish a draft that is still pending", async () => {
    await seedArticle(db, {
      id: "KA-PREICE-PENDING",
      status: "draft",
      reviewStatus: "pending",
      titleZh: ARTICLE.titleZh,
      bodyZh: ARTICLE.bodyZh,
      sources: SOURCES,
      catalogRefs: [],
    });

    await expect(publishKnowledgeArticle(db, {
      articleId: "KA-PREICE-PENDING",
      actor: ACTOR,
    })).rejects.toThrow(/article is not approved/);

    const article = await readArticle(db, "KA-PREICE-PENDING");
    expect(article?.status).toBe("draft");
    const rejected = (await audits(db, "KA-PREICE-PENDING", "article_publish")).filter((entry) => entry.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.detail)).toMatch(/article is not approved/);
  });

  it("H refuses to publish an article that is already published", async () => {
    await seedArticle(db, {
      id: "KA-PREICE-PUBLISHED",
      status: "published",
      reviewStatus: "approved",
      reviewer: REVIEWER,
      reviewedAt: CREATED,
      titleZh: ARTICLE.titleZh,
      bodyZh: ARTICLE.bodyZh,
    });

    await expect(publishKnowledgeArticle(db, {
      articleId: "KA-PREICE-PUBLISHED",
      actor: ACTOR,
    })).rejects.toThrow(/status must be draft/);

    const article = await readArticle(db, "KA-PREICE-PUBLISHED");
    expect(article?.status).toBe("published");
    expect(article?.publishedAt).toBeUndefined();
    const rejected = (await audits(db, "KA-PREICE-PUBLISHED", "article_publish")).filter((entry) => entry.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.detail)).toMatch(/status must be draft/);
  });

  it("I refuses to publish an article that does not exist", async () => {
    await expect(publishKnowledgeArticle(db, {
      articleId: "KA-MISSING",
      actor: ACTOR,
    })).rejects.toThrow(/article does not exist/);

    expect((await db.doc(`${ARTICLES}/KA-MISSING`).get()).exists).toBe(false);
    const rejected = (await audits(db, "KA-MISSING", "article_publish")).filter((entry) => entry.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.detail)).toMatch(/article does not exist/);
  });

  it("J refuses to publish an article whose review was rejected", async () => {
    await seedArticle(db, {
      id: "KA-PREICE-REJECTED",
      status: "draft",
      reviewStatus: "rejected",
      reviewer: REVIEWER,
      reviewedAt: CREATED,
      titleZh: ARTICLE.titleZh,
      bodyZh: ARTICLE.bodyZh,
    });

    await expect(publishKnowledgeArticle(db, {
      articleId: "KA-PREICE-REJECTED",
      actor: ACTOR,
    })).rejects.toThrow(/article is not approved/);

    const article = await readArticle(db, "KA-PREICE-REJECTED");
    expect(article?.status).toBe("draft");
    expect(article?.reviewStatus).toBe("rejected");
    const rejected = (await audits(db, "KA-PREICE-REJECTED", "article_publish")).filter((entry) => entry.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.detail)).toMatch(/article is not approved/);
  });

  it("K approves a draft safety policy", async () => {
    await seedPolicy(db, { ...POLICY_CONTENT, status: "draft", reviewStatus: "pending" });

    await reviewSafetyPolicy(db, {
      policyId: "synth-pub-1",
      reviewer: REVIEWER,
      decision: "approved",
    });

    const policy = await readPolicy(db, "synth-pub-1");
    expect(policy?.status).toBe("draft");
    expect(policy?.reviewStatus).toBe("approved");
    expect(policy?.reviewer).toBe(REVIEWER);
    expect(parseableDate(policy?.reviewedAt)).toBe(true);
    const approved = (await audits(db, "synth-pub-1", "policy_review")).filter((entry) => entry.result === "ok");
    expect(approved).toEqual([
      expect.objectContaining({
        action: "policy_review",
        actor: REVIEWER,
        result: "ok",
        detail: "approved",
        target: { collection: "trainingCatalogSafetyPolicies", id: "synth-pub-1" },
      }),
    ]);
  });

  it("L publishes an approved safety policy that the evaluator can parse", async () => {
    await seedPolicy(db, {
      ...POLICY_CONTENT,
      status: "draft",
      reviewStatus: "approved",
      reviewer: REVIEWER,
      reviewedAt: CREATED,
    });

    await publishSafetyPolicy(db, { policyId: "synth-pub-1", actor: ACTOR });

    const policy = await readPolicy(db, "synth-pub-1");
    expect(policy?.status).toBe("published");
    expect(policy?.policyId).toBe(POLICY_CONTENT.policyId);
    expect(policy?.policyVersion).toBe(POLICY_CONTENT.policyVersion);
    expect(policy?.objectIds).toEqual(POLICY_CONTENT.objectIds);
    expect(policy?.ageBands).toEqual(POLICY_CONTENT.ageBands);
    expect(policy?.blockingRestrictions).toEqual([]);
    expect(policy?.blockingRecoveryFlags).toEqual([]);
    expect(policy?.reviewStatus).toBe("approved");
    expect(parseableDate(policy?.publishedAt)).toBe(true);
    expect(parseSafetyPolicy(policy)).toMatchObject({ ok: true });

    const published = (await audits(db, "synth-pub-1", "policy_publish")).filter((entry) => entry.result === "ok");
    expect(published).toEqual([
      expect.objectContaining({
        action: "policy_publish",
        actor: ACTOR,
        result: "ok",
        target: { collection: "trainingCatalogSafetyPolicies", id: "synth-pub-1" },
      }),
    ]);
  });

  it("M refuses to publish a safety policy that is still pending", async () => {
    await seedPolicy(db, { ...POLICY_CONTENT, status: "draft", reviewStatus: "pending" });

    await expect(publishSafetyPolicy(db, {
      policyId: "synth-pub-1",
      actor: ACTOR,
    })).rejects.toThrow(/policy is not approved/);

    const policy = await readPolicy(db, "synth-pub-1");
    expect(policy?.status).toBe("draft");
    expect(policy?.reviewStatus).toBe("pending");
    const rejected = (await audits(db, "synth-pub-1", "policy_publish")).filter((entry) => entry.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.detail)).toMatch(/policy is not approved/);
  });
});
