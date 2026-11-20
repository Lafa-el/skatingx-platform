import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { evaluateSafety, parseSafetyPolicy } from "@skatingx/training-catalog";
import {
  parseArgs,
  policyDocId,
  publishSafetyPolicy,
  readPolicyDocument,
  contentHash,
  reviewSafetyPolicy,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const POLICIES = `${ROOT}/trainingCatalogSafetyPolicies`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const POLICY_ID = "youth-conditional-v1";
const POLICY_VERSION = "1";
const DOC_ID = policyDocId(POLICY_ID, POLICY_VERSION);
const REVIEWER = "reviewer-1";
const ACTOR = "publisher-1";

const DRAFT = {
  policyId: POLICY_ID,
  policyVersion: POLICY_VERSION,
  status: "draft",
  reviewStatus: "pending",
  objectIds: ["EX-L039", "EX-L078", "EX-L079", "EX-L080"],
  ageBands: ["age8_10", "age11_13", "age14_16"],
  knownRestrictions: ["medical_exercise_restriction"],
  blockingRestrictions: ["medical_exercise_restriction"],
  knownRecoveryFlags: ["current_injury"],
  blockingRecoveryFlags: ["current_injury"],
  objectConditions: [
    { objectId: "EX-L039", decisionMode: "manual_review_only" },
    { objectId: "EX-L078", decisionMode: "blocked" },
    { objectId: "EX-L079", decisionMode: "blocked" },
    { objectId: "EX-L080", decisionMode: "blocked" },
  ],
};

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-p3-policy-v1");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-p3-policy-v1");
  return getFirestore(app);
}

async function audits(db: Firestore, id: string, action: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(AUDIT).where("target.id", "==", id).get();
  return snap.docs.map((item) => item.data()).filter((entry) => entry.action === action);
}

describe("P3-9 policy version binding", () => {
  let db: Firestore;

  beforeAll(async () => {
    expect(PROJECT_ID.startsWith("demo-")).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
    const batch = db.batch();
    for (const id of [DOC_ID, policyDocId(POLICY_ID, "2"), policyDocId("mismatch", "1"), policyDocId("missing-field", "1")]) {
      batch.delete(db.doc(`${POLICIES}/${id}`));
    }
    const logs = await db.collection(AUDIT).where("target.id", "==", DOC_ID).get();
    for (const item of logs.docs) batch.delete(item.ref);
    await batch.commit();
  });

  afterAll(async () => {
    if (!db) return;
    const batch = db.batch();
    batch.delete(db.doc(`${POLICIES}/${DOC_ID}`));
    const logs = await db.collection(AUDIT).where("target.id", "==", DOC_ID).get();
    for (const item of logs.docs) batch.delete(item.ref);
    await batch.commit();
  });

  it("M-01 creates a draft without reviewer or reviewedAt", async () => {
    await db.doc(`${POLICIES}/${DOC_ID}`).set(DRAFT);
    const policy = (await db.doc(`${POLICIES}/${DOC_ID}`).get()).data();
    expect(policy?.status).toBe("draft");
    expect(policy?.reviewStatus).toBe("pending");
    expect(policy).not.toHaveProperty("reviewer");
    expect(policy).not.toHaveProperty("reviewedAt");
    expect(policy?.reviewer).not.toBeNull();
    expect(policy?.reviewedAt).not.toBeNull();
  });

  it("M-02 reviews the draft and stores the content hash", async () => {
    await reviewSafetyPolicy(db, {
      policyId: POLICY_ID,
      policyVersion: POLICY_VERSION,
      reviewer: REVIEWER,
      decision: "approved",
      expectedContentSha256: contentHash((await db.doc(`${POLICIES}/${DOC_ID}`).get()).data() ?? {}),
    });
    const policy = (await db.doc(`${POLICIES}/${DOC_ID}`).get()).data();
    expect(policy?.reviewStatus).toBe("approved");
    expect(policy?.reviewer).toBe(REVIEWER);
    expect(typeof policy?.reviewedAt).toBe("string");
    expect(typeof policy?.reviewedContentSha256).toBe("string");
    const ok = (await audits(db, DOC_ID, "policy_review")).filter((entry) => entry.result === "ok");
    expect(ok).toHaveLength(1);
  });

  it("M-03 publishes the reviewed draft and evaluates the four actions", async () => {
    await publishSafetyPolicy(db, {
      policyId: POLICY_ID,
      policyVersion: POLICY_VERSION,
      actor: ACTOR,
    });
    const policy = (await db.doc(`${POLICIES}/${DOC_ID}`).get()).data();
    expect(policy?.status).toBe("published");
    const athlete = {
      ageBand: "age11_13",
      trainingAge: 2,
      verifiedSkills: ["controlled_landing_verified"],
      recentLoad: "low",
      recoveryFlags: [] as string[],
      supervision: { qualified: true, present: true },
      authorizedRestrictions: [] as string[],
    };
    for (const objectId of ["EX-L078", "EX-L079", "EX-L080"]) {
      expect(evaluateSafety({ objectId, ...athlete }, policy)).toMatchObject({
        decision: "block",
        reasonCodes: ["OBJECT_BLOCKED"],
      });
    }
    expect(evaluateSafety({ objectId: "EX-L039", ...athlete }, policy)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["MANUAL_REVIEW_ONLY"],
    });
  });

  it("M-04 refuses to publish a draft that has no decisionMode", async () => {
    const id = policyDocId("mode-missing", "1");
    await db.doc(`${POLICIES}/${id}`).set({
      ...DRAFT,
      policyId: "mode-missing",
      objectConditions: [
        { objectId: "EX-L039" },
        { objectId: "EX-L078", decisionMode: "blocked" },
        { objectId: "EX-L079", decisionMode: "blocked" },
        { objectId: "EX-L080", decisionMode: "blocked" },
      ],
    });
    await reviewSafetyPolicy(db, {
      policyId: "mode-missing",
      policyVersion: "1",
      reviewer: REVIEWER,
      decision: "approved",
      expectedContentSha256: contentHash((await db.doc(`${POLICIES}/${policyDocId("mode-missing", "1")}`).get()).data() ?? {}),
    });
    await expect(publishSafetyPolicy(db, {
      policyId: "mode-missing",
      policyVersion: "1",
      actor: ACTOR,
    })).rejects.toThrow(/safety policy is invalid/);
    expect((await db.doc(`${POLICIES}/${id}`).get()).data()?.status).toBe("draft");
    await db.doc(`${POLICIES}/${id}`).delete();
  });

  it("M-05 refuses to publish after the reviewed content changes", async () => {
    await db.doc(`${POLICIES}/${DOC_ID}`).set({ ...DRAFT, status: "draft", reviewStatus: "pending" });
    await reviewSafetyPolicy(db, {
      policyId: POLICY_ID,
      policyVersion: POLICY_VERSION,
      reviewer: REVIEWER,
      decision: "approved",
      expectedContentSha256: contentHash((await db.doc(`${POLICIES}/${DOC_ID}`).get()).data() ?? {}),
    });
    await db.doc(`${POLICIES}/${DOC_ID}`).update({ ageBands: ["age8_10"] });
    await expect(publishSafetyPolicy(db, {
      policyId: POLICY_ID,
      policyVersion: POLICY_VERSION,
      actor: ACTOR,
    })).rejects.toThrow(/content changed since review/);
    expect((await db.doc(`${POLICIES}/${DOC_ID}`).get()).data()?.status).toBe("draft");
  });

  it("M-07 returns null unless the document id and version fields match", async () => {
    await db.doc(`${POLICIES}/${DOC_ID}`).set({
      ...DRAFT,
      status: "published",
      reviewStatus: "approved",
      reviewer: REVIEWER,
      reviewedAt: "2026-11-18T00:00:00.000Z",
    });
    await expect(readPolicyDocument(db, POLICY_ID, POLICY_VERSION)).resolves.toMatchObject({
      policyId: POLICY_ID,
      policyVersion: POLICY_VERSION,
    });
    await expect(readPolicyDocument(db, POLICY_ID, "2")).resolves.toBeNull();

    const mismatchId = policyDocId("mismatch", "1");
    await db.doc(`${POLICIES}/${mismatchId}`).set({
      policyId: "mismatch",
      policyVersion: "9",
      status: "published",
    });
    await expect(readPolicyDocument(db, "mismatch", "1")).resolves.toBeNull();

    const missingId = policyDocId("missing-field", "1");
    await db.doc(`${POLICIES}/${missingId}`).set({ policyId: "missing-field", status: "published" });
    await expect(readPolicyDocument(db, "missing-field", "1")).resolves.toBeNull();
    await db.doc(`${POLICIES}/${mismatchId}`).delete();
    await db.doc(`${POLICIES}/${missingId}`).delete();
  });

  it("M-08 accepts --policyVersion and refuses a command that omits it", async () => {
    expect(parseArgs([
      "policy-review",
      "--policyId",
      POLICY_ID,
      "--policyVersion",
      "1",
      "--reviewer",
      REVIEWER,
      "--decision",
      "approved",
    ]).args.policyVersion).toBe("1");
    expect(parseArgs([
      "policy-publish",
      "--policyId",
      POLICY_ID,
      "--policyVersion",
      "1",
      "--actor",
      ACTOR,
    ]).args.policyVersion).toBe("1");
    await expect(reviewSafetyPolicy(db, {
      policyId: POLICY_ID,
      reviewer: REVIEWER,
      decision: "approved",
    } as never)).rejects.toThrow(/policyVersion is required/);
    await expect(publishSafetyPolicy(db, {
      policyId: POLICY_ID,
      actor: ACTOR,
    } as never)).rejects.toThrow(/policyVersion is required/);
  });
});

function conditionalPolicy(condition: Record<string, unknown>) {
  return {
    policyId: "conditional-constraint",
    policyVersion: "1",
    status: "published",
    reviewStatus: "approved",
    reviewer: REVIEWER,
    reviewedAt: "2026-11-18T00:00:00.000Z",
    objectIds: ["EX-L001"],
    ageBands: ["age11_13"],
    knownRestrictions: [] as string[],
    blockingRestrictions: [] as string[],
    knownRecoveryFlags: [] as string[],
    blockingRecoveryFlags: [] as string[],
    objectConditions: [{ objectId: "EX-L001", decisionMode: "conditional", ...condition }],
  };
}

describe("P3-11 conditional constraint parse", () => {
  it("rejects a conditional entry whose only constraint is a zero training age", () => {
    expect(parseSafetyPolicy(conditionalPolicy({ minTrainingAgeYears: 0 })).ok).toBe(false);
    expect(parseSafetyPolicy(conditionalPolicy({
      minTrainingAgeYears: 0,
      requiredSkills: [],
      allowedLoads: [],
    })).ok).toBe(false);
  });

  it("accepts a positive minimum training age", () => {
    expect(parseSafetyPolicy(conditionalPolicy({ minTrainingAgeYears: 1 })).ok).toBe(true);
  });

  it("accepts a zero training age when a required skill supplies the constraint", () => {
    expect(parseSafetyPolicy(conditionalPolicy({
      minTrainingAgeYears: 0,
      requiredSkills: ["skill-a"],
    })).ok).toBe(true);
  });
});
