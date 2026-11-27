import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CatalogKind } from "@skatingx/schema";
import {
  type CatalogObject,
  type CatalogVersion,
  contentChecksumPayload,
  evaluateSafety,
  parseSafetyPolicy,
  type SafetyEvaluationInput,
} from "@skatingx/training-catalog";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum";
import {
  assessEmulatorSafety,
  contentHash,
  editorRecordId,
  policyDocId,
  publishCatalogVersionFlow,
  readPolicyDocument,
  reviewCatalogVersion,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const RELEASES = `${ROOT}/trainingCatalogReleases`;
const POLICIES = `${ROOT}/trainingCatalogSafetyPolicies`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const CONTENT_VERSION = "v1";
const STARTED = "2026-11-16T00:00:00.000Z";
const OBJECT_IDS = ["EX-L001", "EX-L039", "EX-L078", "EX-L079", "EX-L080"] as const;

const READY = {
  ageBand: "age11_13",
  trainingAge: 2,
  verifiedSkills: ["landing"],
  recentLoad: "moderate",
  recoveryFlags: [] as string[],
  supervision: { qualified: true, present: true },
  authorizedRestrictions: [] as string[],
};

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-p3-safety");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-p3-safety");
  return getFirestore(app);
}

function pair(options: {
  id: string;
  kind: CatalogKind;
  legacyAttributes?: Record<string, unknown>;
}): { parent: CatalogObject; version: CatalogVersion } {
  const content = {
    localeContent: { zh: { name: options.id }, en: { name: options.id } },
    taxonomy: { objectiveIds: [] as string[] },
    refs: [] as CatalogObject["refs"],
    legacyAttributes: options.legacyAttributes ?? {},
    schemaVersion: 1,
  };
  const checksum = computeCatalogChecksum(contentChecksumPayload(content));
  const version: CatalogVersion = {
    ...content,
    contentVersion: CONTENT_VERSION,
    status: "draft",
    reviewStatus: "pending",
    checksum,
  };
  const parent: CatalogObject = {
    id: options.id,
    kind: options.kind,
    sportId: "short_track",
    ...content,
    contentVersion: CONTENT_VERSION,
    status: "draft",
    reviewStatus: "pending",
    checksum,
    createdAt: STARTED,
    updatedAt: STARTED,
  };
  return { parent, version };
}

async function seedObject(
  db: Firestore,
  options: Parameters<typeof pair>[0] & { editor: string },
): Promise<void> {
  const { parent, version } = pair(options);
  const batch = db.batch();
  batch.set(db.doc(`${OBJECTS}/${options.id}`), parent);
  batch.set(db.doc(`${OBJECTS}/${options.id}/versions/${CONTENT_VERSION}`), version);
  batch.set(db.doc(`${AUDIT}/${editorRecordId(options.id)}`), {
    action: "edit",
    actor: options.editor,
    target: { collection: "trainingCatalogObjects", id: options.id },
    at: STARTED,
    result: "ok",
  });
  await batch.commit();
}

const EMULATOR_FLOW = { operator: "emulator-operator" };

async function reviewDraft(
  db: Firestore,
  input: { objectId: string; contentVersion: string; reviewer: string; decision: "approved" | "rejected" },
): Promise<void> {
  const snap = await db.doc(`${OBJECTS}/${input.objectId}/versions/${input.contentVersion}`).get();
  const data = snap.data();
  await reviewCatalogVersion(db, {
    ...input,
    expectedContentSha256: data ? contentHash(data) : "0".repeat(64),
  }, EMULATOR_FLOW);
}

async function publishDraft(
  db: Firestore,
  input: { objectId: string; contentVersion: string; reviewer: string },
): Promise<void> {
  await publishCatalogVersionFlow(db, input, EMULATOR_FLOW);
}

function conditionalCover(objectIds: readonly string[]) {
  return objectIds.map((objectId) => ({
    objectId,
    decisionMode: "conditional" as const,
    minTrainingAgeYears: 1,
  }));
}

function synthPolicy() {
  return {
    policyId: "synth-1",
    policyVersion: "synth-1",
    status: "published",
    objectIds: [...OBJECT_IDS],
    ageBands: ["age8_10", "age11_13", "age14_16"],
    blockingRestrictions: ["no_high_impact"],
    blockingRecoveryFlags: ["injury"],
    knownRestrictions: ["no_high_impact", "knee_brace"],
    knownRecoveryFlags: ["injury", "fatigue"],
    objectConditions: conditionalCover(OBJECT_IDS),
    reviewStatus: "approved",
    reviewer: "reviewer-1",
    reviewedAt: "2026-11-16T00:00:00.000Z",
  };
}

async function setPolicy(db: Firestore, policy: Record<string, unknown>, version?: string): Promise<void> {
  const policyId = String(policy.policyId);
  const policyVersion = version ?? (typeof policy.policyVersion === "string" ? policy.policyVersion : "");
  const docId = policyVersion === "" ? policyId : policyDocId(policyId, policyVersion);
  await db.doc(`${POLICIES}/${docId}`).set(policy);
}

async function assess(
  db: Firestore,
  objectId: string,
  athlete: Record<string, unknown>,
  policy: { policyId: string; policyVersion: string } = { policyId: "synth-1", policyVersion: "synth-1" },
) {
  return assessEmulatorSafety(db, { objectId, ...athlete, ...policy });
}

function without(field: string): Record<string, unknown> {
  const input: Record<string, unknown> = { ...READY };
  delete input[field];
  return input;
}

async function audits(db: Firestore, id: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(AUDIT).where("target.id", "==", id).get();
  return snap.docs.map((item) => item.data());
}

async function removeOwnDocuments(db: Firestore): Promise<void> {
  const batch = db.batch();
  for (const id of OBJECT_IDS) {
    batch.delete(db.doc(`${OBJECTS}/${id}/versions/${CONTENT_VERSION}`));
    batch.delete(db.doc(`${OBJECTS}/${id}`));
    batch.delete(db.doc(`${RELEASES}/rel-${id}-${CONTENT_VERSION}`));
  }
  for (const policyId of [
    "synth-1",
    "p1",
    "p1-draft",
    "p1-missing",
    policyDocId("synth-1", "synth-1"),
    policyDocId("p1", "p1"),
    policyDocId("p1-draft", "p1-draft"),
    policyDocId("p1-missing", "p1-missing"),
  ]) {
    batch.delete(db.doc(`${POLICIES}/${policyId}`));
  }
  const logs = await db.collection(AUDIT).where("target.id", "in", [...OBJECT_IDS]).get();
  for (const item of logs.docs) batch.delete(item.ref);
  await batch.commit();
}

describe("P3 youth safety on the emulator", () => {
  let db: Firestore;

  beforeAll(async () => {
    expect(PROJECT_ID.startsWith("demo-")).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
    await removeOwnDocuments(db);
    await seedObject(db, {
      id: "EX-L001",
      kind: "exercise",
      editor: "editor-1",
      legacyAttributes: { youthDefault: "Yes", nameZh: "轻松慢跑" },
    });
    const conditional = {
      youthDefault: "Conditional",
      supervision: "Qualified adult/coach",
      safetyFlag: "review_required",
    };
    await seedObject(db, { id: "EX-L039", kind: "exercise", editor: "editor-1", legacyAttributes: { ...conditional, nameZh: "下落跳" } });
    await seedObject(db, { id: "EX-L078", kind: "exercise", editor: "editor-1", legacyAttributes: { ...conditional, nameZh: "BFR步行" } });
    await seedObject(db, { id: "EX-L079", kind: "exercise", editor: "editor-1", legacyAttributes: { ...conditional, nameZh: "BFR深蹲" } });
    await seedObject(db, { id: "EX-L080", kind: "exercise", editor: "editor-1", legacyAttributes: { ...conditional, nameZh: "BFR提踵" } });
  });

  afterAll(async () => {
    if (db) await removeOwnDocuments(db);
  });

  it("S1 publishes the ordinary draft after approval", async () => {
    await reviewDraft(db, {
      objectId: "EX-L001",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
    });
    await publishDraft(db, {
      objectId: "EX-L001",
      contentVersion: CONTENT_VERSION,
      reviewer: "publisher-1",
    });
    const parent = (await db.doc(`${OBJECTS}/EX-L001`).get()).data();
    const snapshot = (await db.doc(`${OBJECTS}/EX-L001/versions/${CONTENT_VERSION}`).get()).data();
    expect(parent?.status).toBe("published");
    expect(parent?.publishedVersion).toBe(CONTENT_VERSION);
    expect(snapshot?.status).toBe("published");
    expect((await db.doc(`${RELEASES}/rel-EX-L001-${CONTENT_VERSION}`).get()).exists).toBe(true);
    const published = (await audits(db, "EX-L001")).filter((entry) => entry.action === "publish" && entry.result === "ok");
    expect(published).toHaveLength(1);
  });

  it.each(["EX-L039", "EX-L078", "EX-L079", "EX-L080"])(
    "S2-S5 keeps %s draft when publish meets review_required",
    async (objectId) => {
      await reviewDraft(db, {
        objectId,
        contentVersion: CONTENT_VERSION,
        reviewer: "reviewer-1",
        decision: "approved",
      });
      await expect(publishDraft(db, {
        objectId,
        contentVersion: CONTENT_VERSION,
        reviewer: "publisher-1",
      })).rejects.toThrow(/safetyFlag review_required blocks publish/);
      const parent = (await db.doc(`${OBJECTS}/${objectId}`).get()).data();
      const snapshot = (await db.doc(`${OBJECTS}/${objectId}/versions/${CONTENT_VERSION}`).get()).data();
      expect(parent?.status).toBe("draft");
      expect(snapshot?.status).toBe("draft");
      expect((await db.doc(`${RELEASES}/rel-${objectId}-${CONTENT_VERSION}`).get()).exists).toBe(false);
      const rejected = (await audits(db, objectId)).filter((entry) => entry.action === "publish" && entry.result === "rejected");
      expect(rejected).toHaveLength(1);
    },
  );

  it("E1 and E2 return POLICY_MISSING for an empty policy library", async () => {
    await db.doc(`${POLICIES}/${policyDocId("synth-1", "synth-1")}`).delete();
    for (const objectId of ["EX-L039", "EX-L001"]) {
      const result = await assess(db, objectId, READY);
      expect(result).toEqual({
        decision: "review_required",
        reasonCodes: ["POLICY_MISSING"],
        policyVersion: null,
      });
    }
  });

  it("E3 returns POLICY_NOT_APPLICABLE when the policy scope misses the object", async () => {
    await setPolicy(db, {
      policyId: "p1",
      policyVersion: "p1",
      status: "published",
      objectIds: ["EX-L001"],
      ageBands: ["age8_10", "age14_16"],
      blockingRestrictions: ["no_high_impact"],
      blockingRecoveryFlags: ["injury"],
      knownRestrictions: ["no_high_impact"],
      knownRecoveryFlags: ["injury"],
      objectConditions: conditionalCover(["EX-L001"]),
      reviewStatus: "approved",
      reviewer: "reviewer-1",
      reviewedAt: STARTED,
    });
    const result = await assess(db, "EX-L079", READY, { policyId: "p1", policyVersion: "p1" });
    expect(result).toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_NOT_APPLICABLE"],
      policyVersion: "p1",
    });
  });

  it("E4 returns POLICY_INVALID for an unpublished policy and for a missing version", async () => {
    await setPolicy(db, {
      policyId: "p1-draft",
      policyVersion: "p1-draft",
      status: "draft",
      objectIds: ["EX-L080"],
      ageBands: ["age11_13"],
      blockingRestrictions: ["no_high_impact"],
      blockingRecoveryFlags: ["injury"],
    });
    const draft = await assess(db, "EX-L080", READY, { policyId: "p1-draft", policyVersion: "p1-draft" });
    expect(draft).toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_INVALID"],
      policyVersion: "p1-draft",
    });

    await setPolicy(db, {
      policyId: "p1-missing",
      status: "published",
      objectIds: ["EX-L080"],
      ageBands: ["age11_13"],
    }, "p1-missing");
    const missingVersion = await assess(db, "EX-L080", READY, { policyId: "p1-missing", policyVersion: "p1-missing" });
    expect(missingVersion).toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
    });
  });

  it("E5 returns INPUT_MISSING:trainingAge", async () => {
    await setPolicy(db, synthPolicy());
    const result = await assess(db, "EX-L039", without("trainingAge"));
    expect(result).toEqual({
      decision: "review_required",
      reasonCodes: ["INPUT_MISSING:trainingAge"],
      policyVersion: "synth-1",
    });
  });

  it("E6a distinguishes a missing skills field from an empty skill list", async () => {
    await setPolicy(db, synthPolicy());
    const result = await assess(db, "EX-L001", without("verifiedSkills"));
    expect(result).toEqual({
      decision: "review_required",
      reasonCodes: ["INPUT_MISSING:verifiedSkills"],
      policyVersion: "synth-1",
    });
  });

  it("E6b returns NO_VERIFIED_SKILLS when the skill list is empty", async () => {
    await setPolicy(db, synthPolicy());
    const result = await assess(db, "EX-L001", { ...READY, verifiedSkills: [] });
    expect(result).toEqual({
      decision: "review_required",
      reasonCodes: ["NO_VERIFIED_SKILLS"],
      policyVersion: "synth-1",
    });
  });

  it.each([
    ["recentLoad", "INPUT_MISSING:recentLoad"],
    ["recoveryFlags", "INPUT_MISSING:recoveryFlags"],
    ["supervision", "INPUT_MISSING:supervision"],
    ["authorizedRestrictions", "INPUT_MISSING:authorizedRestrictions"],
  ] as const)("E7 omits %s", async (field, reason) => {
    await setPolicy(db, synthPolicy());
    const result = await assess(db, "EX-L078", without(field));
    expect(result).toEqual({
      decision: "review_required",
      reasonCodes: [reason],
      policyVersion: "synth-1",
    });
  });

  it("E8 and E9 return SUPERVISION_INSUFFICIENT when qualified or present is false", async () => {
    await setPolicy(db, synthPolicy());
    const unqualified = await assess(db, "EX-L039", {
      ...READY,
      supervision: { qualified: false, present: true },
    });
    const absent = await assess(db, "EX-L078", {
      ...READY,
      supervision: { qualified: true, present: false },
    });
    expect(unqualified).toEqual({
      decision: "review_required",
      reasonCodes: ["SUPERVISION_INSUFFICIENT"],
      policyVersion: "synth-1",
    });
    expect(absent).toEqual(unqualified);
  });

  it("E10 allows an ordinary object when the synthetic policy is satisfied", async () => {
    await setPolicy(db, synthPolicy());
    const athlete = { ...READY, verifiedSkills: ["jogging"] };
    for (const ageBand of ["age8_10", "age11_13", "age14_16"]) {
      const result = await assess(db, "EX-L001", { ...athlete, ageBand });
      expect(result).toEqual({
        decision: "allow",
        reasonCodes: ["POLICY_SATISFIED"],
        policyVersion: "synth-1",
      });
    }
  });

  it("E11 returns allow_with_supervision for a conditional object", async () => {
    await setPolicy(db, synthPolicy());
    const result = await assess(db, "EX-L039", READY);
    expect(result).toEqual({
      decision: "allow_with_supervision",
      reasonCodes: ["POLICY_SATISFIED"],
      policyVersion: "synth-1",
    });
    const snapshot = (await db.doc(`${OBJECTS}/EX-L039/versions/${CONTENT_VERSION}`).get()).data();
    expect(snapshot?.legacyAttributes?.safetyFlag).toBe("review_required");
    expect(snapshot?.status).toBe("draft");
  });

  it("E12 blocks on a restriction or a recovery flag", async () => {
    await setPolicy(db, synthPolicy());
    const restricted = await assess(db, "EX-L039", { ...READY, authorizedRestrictions: ["no_high_impact"] });
    const injured = await assess(db, "EX-L039", { ...READY, recoveryFlags: ["injury"] });
    expect(restricted).toEqual({
      decision: "block",
      reasonCodes: ["RESTRICTION_BLOCK"],
      policyVersion: "synth-1",
    });
    expect(injured).toEqual({
      decision: "block",
      reasonCodes: ["RECOVERY_FLAG_BLOCK"],
      policyVersion: "synth-1",
    });
  });

  it("E13 separates a missing age band from an unrecognized age band", async () => {
    await setPolicy(db, synthPolicy());
    const missing = await assess(db, "EX-L001", without("ageBand"));
    const unknown = await assess(db, "EX-L001", { ...READY, ageBand: "age99_99" });
    expect(missing).toEqual({
      decision: "review_required",
      reasonCodes: ["INPUT_MISSING:ageBand"],
      policyVersion: "synth-1",
    });
    expect(unknown).toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_NOT_APPLICABLE"],
      policyVersion: "synth-1",
    });
    expect(missing.decision).not.toBe("allow");
    expect(unknown.decision).not.toBe("allow");
  });

  it("fails closed when the policy read throws, times out, or returns nothing", async () => {
    const request = { objectId: "EX-L001", ...READY, policyId: "synth-1", policyVersion: "synth-1" };
    const thrown = await assessEmulatorSafety(db, request, {
      readPolicy: () => Promise.reject(new Error("emulator read failed")),
    });
    const empty = await assessEmulatorSafety(db, request, {
      readPolicy: () => Promise.resolve(null),
    });
    const timedOut = await assessEmulatorSafety(db, request, {
      readPolicy: () => new Promise(() => {}),
      timeoutMs: 20,
    });
    for (const result of [thrown, empty, timedOut]) {
      expect(result).toEqual({
        decision: "review_required",
        reasonCodes: ["POLICY_MISSING"],
        policyVersion: null,
      });
    }
  });
});

function approvedPolicy(overrides: Record<string, unknown> = {}) {
  return {
    policyId: "p",
    policyVersion: "p",
    status: "published",
    objectIds: ["EX-L001"],
    ageBands: ["age11_13"],
    blockingRestrictions: ["no_high_impact"],
    blockingRecoveryFlags: ["injury"],
    knownRestrictions: ["no_high_impact", "knee_brace"],
    knownRecoveryFlags: ["injury", "fatigue"],
    objectConditions: conditionalCover(["EX-L001"]),
    reviewStatus: "approved",
    reviewer: "reviewer-1",
    reviewedAt: "2026-11-16T00:00:00.000Z",
    ...overrides,
  };
}

const CONDITIONED = {
  ...approvedPolicy({
    policyId: "synth-hard",
    policyVersion: "synth-hard",
    objectIds: ["EX-L039"],
    ageBands: ["age8_10", "age11_13", "age14_16"],
  }),
  objectConditions: [
    {
      objectId: "EX-L039",
      decisionMode: "conditional" as const,
      minTrainingAgeYears: 1,
      requiredSkills: ["landing"],
      allowedLoads: ["low", "moderate"],
    },
  ],
};

const CONDITIONED_ATHLETE = {
  objectId: "EX-L039",
  ageBand: "age11_13",
  trainingAge: 2,
  verifiedSkills: ["landing"],
  recentLoad: "moderate",
  recoveryFlags: [] as string[],
  supervision: { qualified: true, present: true },
  authorizedRestrictions: [] as string[],
};

describe("P3-5 policy parse fail-closed", () => {
  it("rejects a published policy that is missing reviewStatus", () => {
    const { reviewStatus, ...policy } = approvedPolicy();
    expect(reviewStatus).toBe("approved");
    expect(parseSafetyPolicy(policy).ok).toBe(false);
  });

  it("rejects reviewStatus rejected and pending", () => {
    expect(parseSafetyPolicy(approvedPolicy({ reviewStatus: "rejected" })).ok).toBe(false);
    expect(parseSafetyPolicy(approvedPolicy({ reviewStatus: "pending" })).ok).toBe(false);
  });

  it("accepts reviewStatus approved with a reviewer and a parseable reviewedAt", () => {
    expect(parseSafetyPolicy(approvedPolicy()).ok).toBe(true);
  });

  it("rejects a blocking restriction that is not in the known list", () => {
    expect(parseSafetyPolicy(approvedPolicy({
      blockingRestrictions: ["no_high_impact", "unknown_limit"],
    })).ok).toBe(false);
  });

  it("rejects a blocking recovery flag that is not in the known list", () => {
    expect(parseSafetyPolicy(approvedPolicy({
      blockingRecoveryFlags: ["injury", "unknown_flag"],
    })).ok).toBe(false);
  });
});

describe("P3-5 evaluator hardening", () => {
  it("returns UNKNOWN_RESTRICTION for a restriction outside the known list", () => {
    expect(evaluateSafety({
      ...CONDITIONED_ATHLETE,
      authorizedRestrictions: ["not_listed"],
    }, CONDITIONED)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["UNKNOWN_RESTRICTION"],
    });
  });

  it("returns UNKNOWN_RECOVERY_FLAG for a recovery flag outside the known list", () => {
    expect(evaluateSafety({
      ...CONDITIONED_ATHLETE,
      recoveryFlags: ["not_listed"],
    }, CONDITIONED)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["UNKNOWN_RECOVERY_FLAG"],
    });
  });

  it("does not treat a known non-blocking restriction or recovery flag as unknown", () => {
    expect(evaluateSafety({
      ...CONDITIONED_ATHLETE,
      authorizedRestrictions: ["knee_brace"],
    }, CONDITIONED)).toEqual({
      decision: "allow_with_supervision",
      reasonCodes: ["POLICY_SATISFIED"],
      policyVersion: "synth-hard",
    });
    expect(evaluateSafety({
      ...CONDITIONED_ATHLETE,
      recoveryFlags: ["fatigue"],
    }, CONDITIONED)).toEqual({
      decision: "allow_with_supervision",
      reasonCodes: ["POLICY_SATISFIED"],
      policyVersion: "synth-hard",
    });
  });

  it("returns TRAINING_AGE_INSUFFICIENT when training age is below the object minimum", () => {
    expect(evaluateSafety({ ...CONDITIONED_ATHLETE, trainingAge: 0 }, CONDITIONED)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["TRAINING_AGE_INSUFFICIENT"],
    });
  });

  it("returns REQUIRED_SKILL_MISSING when a required skill is absent", () => {
    expect(evaluateSafety({
      ...CONDITIONED_ATHLETE,
      verifiedSkills: ["balance"],
    }, CONDITIONED)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["REQUIRED_SKILL_MISSING"],
    });
  });

  it("returns LOAD_NOT_ALLOWED when the recent load is outside the allowed list", () => {
    expect(evaluateSafety({ ...CONDITIONED_ATHLETE, recentLoad: "high" }, CONDITIONED)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["LOAD_NOT_ALLOWED"],
    });
  });

  it("returns allow_with_supervision for EX-L039 when every object condition is met", () => {
    expect(evaluateSafety(CONDITIONED_ATHLETE, CONDITIONED)).toEqual({
      decision: "allow_with_supervision",
      reasonCodes: ["POLICY_SATISFIED"],
      policyVersion: "synth-hard",
    });
  });
});

const V1_OBJECTS = ["EX-L039", "EX-L078", "EX-L079", "EX-L080"] as const;
const V1_RESTRICTIONS = [
  "medical_exercise_restriction",
  "no_high_impact",
  "active_lower_limb_injury",
  "current_joint_pain",
  "vascular_or_clotting_risk",
];
const V1_RECOVERY = [
  "current_injury",
  "acute_illness",
  "significant_fatigue",
  "persistent_pain",
  "dizziness_or_fainting",
  "inadequate_recovery",
  "dehydration",
];

function v1Policy(overrides: Record<string, unknown> = {}) {
  return {
    policyId: "youth-conditional-v1",
    policyVersion: "1",
    status: "published",
    reviewStatus: "approved",
    reviewer: "reviewer-1",
    reviewedAt: "2026-11-18T00:00:00.000Z",
    objectIds: [...V1_OBJECTS],
    ageBands: ["age8_10", "age11_13", "age14_16"],
    knownRestrictions: [...V1_RESTRICTIONS],
    blockingRestrictions: [...V1_RESTRICTIONS],
    knownRecoveryFlags: [...V1_RECOVERY],
    blockingRecoveryFlags: [...V1_RECOVERY],
    objectConditions: [
      { objectId: "EX-L039", decisionMode: "manual_review_only" },
      { objectId: "EX-L078", decisionMode: "blocked" },
      { objectId: "EX-L079", decisionMode: "blocked" },
      { objectId: "EX-L080", decisionMode: "blocked" },
    ],
    ...overrides,
  };
}

function publishedShell(objectIds: string[], objectConditions: Record<string, unknown>[]) {
  return {
    policyId: "synth-mode",
    policyVersion: "1",
    status: "published",
    reviewStatus: "approved",
    reviewer: "reviewer-1",
    reviewedAt: "2026-11-18T00:00:00.000Z",
    objectIds,
    ageBands: ["age8_10", "age11_13", "age14_16"],
    knownRestrictions: ["knee_brace"],
    blockingRestrictions: [] as string[],
    knownRecoveryFlags: ["current_injury"],
    blockingRecoveryFlags: [] as string[],
    objectConditions,
  };
}

const FULL_INPUT = {
  ageBand: "age11_13",
  trainingAge: 2,
  verifiedSkills: ["controlled_landing_verified"],
  recentLoad: "low",
  recoveryFlags: [] as string[],
  supervision: { qualified: true, present: true },
  authorizedRestrictions: [] as string[],
};

function dropField(objectId: string, field: string): SafetyEvaluationInput {
  const input: Record<string, unknown> = { objectId, ...FULL_INPUT };
  delete input[field];
  return input as unknown as SafetyEvaluationInput;
}

describe("P3-9 policy parse decision mode", () => {
  it("P-01 accepts the reviewed v1 policy", () => {
    expect(parseSafetyPolicy(v1Policy())).toMatchObject({ ok: true });
  });

  it("P-02 rejects an object condition without decisionMode", () => {
    const policy = v1Policy({
      objectConditions: [
        { objectId: "EX-L039" },
        { objectId: "EX-L078", decisionMode: "blocked" },
        { objectId: "EX-L079", decisionMode: "blocked" },
        { objectId: "EX-L080", decisionMode: "blocked" },
      ],
    });
    expect(parseSafetyPolicy(policy)).toMatchObject({ ok: false, detail: "object conditions are invalid" });
  });

  it("P-03 and P-04 reject unrecognized decision modes", () => {
    for (const decisionMode of ["auto_allow", "allow"]) {
      const policy = v1Policy({
        objectConditions: V1_OBJECTS.map((objectId) => ({ objectId, decisionMode })),
      });
      expect(parseSafetyPolicy(policy).ok).toBe(false);
    }
  });

  it("P-05 rejects an object condition outside objectIds", () => {
    const policy = v1Policy({
      objectConditions: [
        ...(v1Policy().objectConditions as Record<string, unknown>[]),
        { objectId: "EX-L999", decisionMode: "blocked" },
      ],
    });
    expect(parseSafetyPolicy(policy).ok).toBe(false);
  });

  it("P-06 rejects an empty object id", () => {
    expect(parseSafetyPolicy(publishedShell([""], [{ objectId: "", decisionMode: "blocked" }])).ok).toBe(false);
  });

  it("P-07 rejects a missing or empty policyVersion", () => {
    const { policyVersion: _version, ...missing } = v1Policy();
    expect(parseSafetyPolicy(missing).ok).toBe(false);
    expect(parseSafetyPolicy(v1Policy({ policyVersion: "" })).ok).toBe(false);
    expect(parseSafetyPolicy(v1Policy({ policyVersion: "   " })).ok).toBe(false);
  });

  it("P-08 rejects a blocking restriction outside the known list", () => {
    expect(parseSafetyPolicy(v1Policy({
      blockingRestrictions: [...V1_RESTRICTIONS, "not_known"],
    })).ok).toBe(false);
  });

  it("P-09 and P-10 reject a missing objectConditions field", () => {
    const { objectConditions: _conditions, ...missing } = v1Policy();
    expect(parseSafetyPolicy(missing).ok).toBe(false);
    expect(parseSafetyPolicy(v1Policy({ objectConditions: undefined })).ok).toBe(false);
  });

  it("P-11 rejects an empty objectConditions array", () => {
    expect(parseSafetyPolicy(v1Policy({ objectConditions: [] })).ok).toBe(false);
  });

  it("P-12 rejects a policy that omits one object", () => {
    expect(parseSafetyPolicy(v1Policy({
      objectConditions: [
        { objectId: "EX-L039", decisionMode: "manual_review_only" },
        { objectId: "EX-L078", decisionMode: "blocked" },
        { objectId: "EX-L079", decisionMode: "blocked" },
      ],
    })).ok).toBe(false);
  });

  it("P-13 rejects a repeated object id", () => {
    expect(parseSafetyPolicy(v1Policy({
      objectConditions: [
        { objectId: "EX-L039", decisionMode: "manual_review_only" },
        { objectId: "EX-L039", decisionMode: "blocked" },
        { objectId: "EX-L078", decisionMode: "blocked" },
        { objectId: "EX-L079", decisionMode: "blocked" },
      ],
    })).ok).toBe(false);
  });

  it("P-14 rejects a conditional entry with no trusted condition", () => {
    expect(parseSafetyPolicy(publishedShell(
      ["EX-L001"],
      [{ objectId: "EX-L001", decisionMode: "conditional" }],
    )).ok).toBe(false);
  });

  it("P-15 accepts a conditional entry with only a minimum training age", () => {
    expect(parseSafetyPolicy(publishedShell(
      ["EX-L001"],
      [{ objectId: "EX-L001", decisionMode: "conditional", minTrainingAgeYears: 2 }],
    )).ok).toBe(true);
  });

  it("P-16 accepts a conditional entry with only required skills", () => {
    expect(parseSafetyPolicy(publishedShell(
      ["EX-L001"],
      [{ objectId: "EX-L001", decisionMode: "conditional", requiredSkills: ["skill-a"] }],
    )).ok).toBe(true);
  });

  it("P-17 accepts a conditional entry with only allowed loads", () => {
    expect(parseSafetyPolicy(publishedShell(
      ["EX-L001"],
      [{ objectId: "EX-L001", decisionMode: "conditional", allowedLoads: ["low"] }],
    )).ok).toBe(true);
  });

  it("P-18 and P-19 reject empty condition arrays", () => {
    expect(parseSafetyPolicy(publishedShell(
      ["EX-L001"],
      [{ objectId: "EX-L001", decisionMode: "conditional", requiredSkills: [] }],
    )).ok).toBe(false);
    expect(parseSafetyPolicy(publishedShell(
      ["EX-L001"],
      [{ objectId: "EX-L001", decisionMode: "conditional", allowedLoads: [] }],
    )).ok).toBe(false);
  });

  it("P-20 rejects a blocked entry that carries a training age", () => {
    expect(parseSafetyPolicy(publishedShell(
      ["EX-L078"],
      [{ objectId: "EX-L078", decisionMode: "blocked", minTrainingAgeYears: 2 }],
    )).ok).toBe(false);
  });

  it("P-21 rejects a manual-review entry that carries skills", () => {
    expect(parseSafetyPolicy(publishedShell(
      ["EX-L039"],
      [{ objectId: "EX-L039", decisionMode: "manual_review_only", requiredSkills: ["skill-a"] }],
    )).ok).toBe(false);
  });

  it("P-22 rejects a blocked entry that carries loads", () => {
    expect(parseSafetyPolicy(publishedShell(
      ["EX-L078"],
      [{ objectId: "EX-L078", decisionMode: "blocked", allowedLoads: ["low"] }],
    )).ok).toBe(false);
  });

  it("P-23 reads a policy only when the document id and fields match", async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    const db = openFirestore();
    const id = policyDocId("youth-conditional-v1", "1");
    await db.doc(`${POLICIES}/${id}`).set(v1Policy());
    await expect(readPolicyDocument(db, "youth-conditional-v1", "1")).resolves.toMatchObject({
      policyId: "youth-conditional-v1",
      policyVersion: "1",
    });
    await expect(readPolicyDocument(db, "youth-conditional-v1", "2")).resolves.toBeNull();
    await db.doc(`${POLICIES}/${id}`).delete();
  });
});

describe("P3-9 evaluator decision mode", () => {
  const policy = v1Policy();

  function decide(objectId: string, input: Record<string, unknown> = {}, source: unknown = policy) {
    return evaluateSafety({ objectId, ...FULL_INPUT, ...input }, source);
  }

  it("E-01 through E-03 block the three BFR exercises", () => {
    for (const objectId of ["EX-L078", "EX-L079", "EX-L080"]) {
      expect(decide(objectId)).toEqual({
        decision: "block",
        reasonCodes: ["OBJECT_BLOCKED"],
        policyVersion: "1",
      });
    }
  });

  it("E-04 through E-06 keep a block when BFR input is restricted, missing, or unknown", () => {
    expect(decide("EX-L078", { authorizedRestrictions: ["medical_exercise_restriction"] }).reasonCodes).toEqual(["OBJECT_BLOCKED"]);
    const { supervision: _supervision, ...withoutSupervision } = { ...FULL_INPUT, objectId: "EX-L078" };
    expect(evaluateSafety(withoutSupervision, policy)).toMatchObject({ decision: "block", reasonCodes: ["OBJECT_BLOCKED"] });
    expect(decide("EX-L078", { authorizedRestrictions: ["knee_brace"] })).toMatchObject({
      decision: "block",
      reasonCodes: ["OBJECT_BLOCKED"],
    });
  });

  it("E-07 and E-08 keep drop jumps in manual review even when the form is complete", () => {
    expect(decide("EX-L039")).toMatchObject({ decision: "review_required", reasonCodes: ["MANUAL_REVIEW_ONLY"] });
    expect(decide("EX-L039", { recentLoad: "high" })).toMatchObject({
      decision: "review_required",
      reasonCodes: ["MANUAL_REVIEW_ONLY"],
    });
  });

  it("E-09 through E-11 surface a drop-jump block or unknown flag before manual review", () => {
    expect(decide("EX-L039", { recoveryFlags: ["current_injury"] }).reasonCodes).toEqual(["RECOVERY_FLAG_BLOCK"]);
    expect(decide("EX-L039", { recoveryFlags: ["unknown_flag"] }).reasonCodes).toEqual(["UNKNOWN_RECOVERY_FLAG"]);
    const { trainingAge: _age, ...withoutAge } = { ...FULL_INPUT, objectId: "EX-L039" };
    expect(evaluateSafety(withoutAge, policy).reasonCodes).toEqual(["MANUAL_REVIEW_ONLY"]);
  });

  it("E-12 allows a conditional object when its load condition passes", () => {
    const conditional = publishedShell(
      ["EX-L039", "EX-L001"],
      [
        { objectId: "EX-L039", decisionMode: "conditional", allowedLoads: ["low"] },
        { objectId: "EX-L001", decisionMode: "conditional", allowedLoads: ["low"] },
      ],
    );
    expect(decide("EX-L039", {}, conditional)).toEqual({
      decision: "allow_with_supervision",
      reasonCodes: ["POLICY_SATISFIED"],
      policyVersion: "1",
    });
    expect(decide("EX-L001", {}, conditional)).toEqual({
      decision: "allow",
      reasonCodes: ["POLICY_SATISFIED"],
      policyVersion: "1",
    });
  });

  it("E-13 returns POLICY_INVALID when an object has no condition entry", () => {
    const incomplete = v1Policy({
      objectIds: ["EX-L039", "EX-L078"],
      objectConditions: [{ objectId: "EX-L078", decisionMode: "blocked" }],
    });
    expect(decide("EX-L039", {}, incomplete)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["POLICY_INVALID"],
    });
  });

  it("E-14 and E-15 reject an object or age band outside the policy", () => {
    expect(decide("EX-L001")).toMatchObject({ decision: "review_required", reasonCodes: ["POLICY_NOT_APPLICABLE"] });
    expect(decide("EX-L039", { ageBand: "age17_18" })).toMatchObject({
      decision: "review_required",
      reasonCodes: ["POLICY_NOT_APPLICABLE"],
    });
  });

  it("E-17 through E-21 block BFR when a general input is missing", () => {
    for (const field of ["trainingAge", "verifiedSkills", "recentLoad", "recoveryFlags", "authorizedRestrictions"] as const) {
      expect(evaluateSafety(dropField("EX-L078", field), policy)).toMatchObject({ decision: "block", reasonCodes: ["OBJECT_BLOCKED"] });
    }
  });

  it("E-22 requires an age band before the BFR decision", () => {
    expect(evaluateSafety(dropField("EX-L078", "ageBand"), policy)).toEqual({
      decision: "review_required",
      reasonCodes: ["INPUT_MISSING:ageBand"],
      policyVersion: "1",
    });
  });

  it("E-23 through E-29 block BFR for unknown flags, weak supervision, and empty lists", () => {
    expect(decide("EX-L078", { recoveryFlags: ["unknown_flag"] }).reasonCodes).toEqual(["OBJECT_BLOCKED"]);
    expect(decide("EX-L078", { supervision: { qualified: false, present: true } }).reasonCodes).toEqual(["OBJECT_BLOCKED"]);
    expect(decide("EX-L078", { supervision: { qualified: true, present: false } }).reasonCodes).toEqual(["OBJECT_BLOCKED"]);
    expect(decide("EX-L078", { verifiedSkills: [] }).reasonCodes).toEqual(["OBJECT_BLOCKED"]);
    expect(decide("EX-L078", { recoveryFlags: [] }).reasonCodes).toEqual(["OBJECT_BLOCKED"]);
    expect(decide("EX-L078", { authorizedRestrictions: [] }).reasonCodes).toEqual(["OBJECT_BLOCKED"]);
    expect(decide("EX-L078", { verifiedSkills: [], recoveryFlags: [], authorizedRestrictions: [] }).reasonCodes).toEqual(["OBJECT_BLOCKED"]);
  });

  it("E-30 and E-31 stay review_required without a usable policy", () => {
    expect(evaluateSafety({ objectId: "EX-L078", ...FULL_INPUT }, null)).toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
    });
    const invalid = v1Policy({
      objectConditions: [
        { objectId: "EX-L039" },
        { objectId: "EX-L078", decisionMode: "blocked" },
        { objectId: "EX-L079", decisionMode: "blocked" },
        { objectId: "EX-L080", decisionMode: "blocked" },
      ],
    });
    expect(evaluateSafety({ objectId: "EX-L078", ...FULL_INPUT }, invalid)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["POLICY_INVALID"],
    });
  });

  it("E-32 through E-35 keep drop jumps in manual review", () => {
    expect(evaluateSafety(dropField("EX-L039", "supervision"), policy).reasonCodes).toEqual(["MANUAL_REVIEW_ONLY"]);
    expect(decide("EX-L039", { authorizedRestrictions: ["knee_brace"] }).reasonCodes).toEqual(["UNKNOWN_RESTRICTION"]);
    expect(evaluateSafety(dropField("EX-L039", "trainingAge"), policy).reasonCodes).toEqual(["MANUAL_REVIEW_ONLY"]);
    expect(decide("EX-L039", { verifiedSkills: [] }).reasonCodes).toEqual(["MANUAL_REVIEW_ONLY"]);
  });

  it("E-36 through E-38 apply conditional skill and load checks", () => {
    const conditional = publishedShell(
      ["EX-L039"],
      [{ objectId: "EX-L039", decisionMode: "conditional", requiredSkills: ["skill-a"], allowedLoads: ["low"] }],
    );
    expect(decide("EX-L039", { verifiedSkills: ["skill-a"], recentLoad: "low" }, conditional)).toMatchObject({
      decision: "allow_with_supervision",
      reasonCodes: ["POLICY_SATISFIED"],
    });
    expect(decide("EX-L039", { verifiedSkills: ["other"], recentLoad: "low" }, conditional)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["REQUIRED_SKILL_MISSING"],
    });
    expect(decide("EX-L039", { verifiedSkills: ["skill-a"], recentLoad: "high" }, conditional)).toMatchObject({
      decision: "review_required",
      reasonCodes: ["LOAD_NOT_ALLOWED"],
    });
  });

  it("E-39 through E-43 return POLICY_INVALID for a malformed policy", () => {
    const { objectConditions: _conditions, ...missing } = v1Policy();
    const cases = [
      missing,
      v1Policy({ objectConditions: [] }),
      v1Policy({
        objectConditions: [
          { objectId: "EX-L039", decisionMode: "manual_review_only" },
          { objectId: "EX-L078", decisionMode: "blocked" },
          { objectId: "EX-L079", decisionMode: "blocked" },
        ],
      }),
      v1Policy({
        objectConditions: [
          { objectId: "EX-L039", decisionMode: "manual_review_only" },
          { objectId: "EX-L039", decisionMode: "blocked" },
          { objectId: "EX-L078", decisionMode: "blocked" },
          { objectId: "EX-L079", decisionMode: "blocked" },
        ],
      }),
      publishedShell(["EX-L039"], [{ objectId: "EX-L039", decisionMode: "conditional" }]),
    ];
    for (const source of cases) {
      expect(evaluateSafety({ objectId: "EX-L078", ...FULL_INPUT }, source)).toMatchObject({
        decision: "review_required",
        reasonCodes: ["POLICY_INVALID"],
      });
    }
  });
});

describe("P3-11 manual review hard block", () => {
  const policy = v1Policy();

  function decide(objectId: string, input: Record<string, unknown> = {}) {
    return evaluateSafety({ objectId, ...FULL_INPUT, ...input }, policy);
  }

  it("blocks EX-L039 when a known restriction is present", () => {
    expect(decide("EX-L039", { authorizedRestrictions: ["medical_exercise_restriction"] })).toMatchObject({
      decision: "block",
      reasonCodes: ["RESTRICTION_BLOCK"],
    });
  });

  it("blocks EX-L039 when current_injury is present", () => {
    expect(decide("EX-L039", { recoveryFlags: ["current_injury"] })).toMatchObject({
      decision: "block",
      reasonCodes: ["RECOVERY_FLAG_BLOCK"],
    });
  });

  it("prefers a known block when an unknown flag is also present", () => {
    expect(decide("EX-L039", {
      authorizedRestrictions: ["medical_exercise_restriction", "knee_brace"],
      recoveryFlags: ["unknown_flag"],
    })).toMatchObject({
      decision: "block",
      reasonCodes: ["RESTRICTION_BLOCK"],
    });
    expect(decide("EX-L039", {
      recoveryFlags: ["current_injury", "unknown_flag"],
    })).toMatchObject({
      decision: "block",
      reasonCodes: ["RECOVERY_FLAG_BLOCK"],
    });
  });

  it("blocks EX-L039 when other inputs are missing but the blocking flag is present", () => {
    for (const field of ["trainingAge", "verifiedSkills", "recentLoad"] as const) {
      expect(evaluateSafety({
        ...dropField("EX-L039", field),
        authorizedRestrictions: ["no_high_impact"],
      }, policy)).toMatchObject({
        decision: "block",
        reasonCodes: ["RESTRICTION_BLOCK"],
      });
      expect(evaluateSafety({
        ...dropField("EX-L039", field),
        recoveryFlags: ["current_injury"],
      }, policy)).toMatchObject({
        decision: "block",
        reasonCodes: ["RECOVERY_FLAG_BLOCK"],
      });
    }
  });

  it("requires review for an unknown restriction or recovery flag without a known block", () => {
    expect(decide("EX-L039", { authorizedRestrictions: ["knee_brace"] })).toMatchObject({
      decision: "review_required",
      reasonCodes: ["UNKNOWN_RESTRICTION"],
    });
    expect(decide("EX-L039", { recoveryFlags: ["unknown_flag"] })).toMatchObject({
      decision: "review_required",
      reasonCodes: ["UNKNOWN_RECOVERY_FLAG"],
    });
  });

  it("keeps a clean EX-L039 in manual review and a blocked BFR object blocked", () => {
    expect(decide("EX-L039")).toMatchObject({
      decision: "review_required",
      reasonCodes: ["MANUAL_REVIEW_ONLY"],
    });
    expect(decide("EX-L078", {
      authorizedRestrictions: ["medical_exercise_restriction"],
      recoveryFlags: ["current_injury"],
    })).toMatchObject({
      decision: "block",
      reasonCodes: ["OBJECT_BLOCKED"],
    });
  });
});
