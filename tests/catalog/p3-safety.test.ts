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
} from "@skatingx/training-catalog";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum";
import {
  assessEmulatorSafety,
  publishCatalogVersionFlow,
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
  batch.set(db.collection(AUDIT).doc(`p3-editor-${options.id}`), {
    action: "edit",
    actor: options.editor,
    target: { collection: "trainingCatalogObjects", id: options.id },
    at: STARTED,
    result: "ok",
  });
  await batch.commit();
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
    reviewStatus: "approved",
    reviewer: "reviewer-1",
    reviewedAt: "2026-11-16T00:00:00.000Z",
  };
}

async function setPolicy(db: Firestore, policyId: string, policy: Record<string, unknown>): Promise<void> {
  await db.doc(`${POLICIES}/${policyId}`).set(policy);
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
  for (const policyId of ["synth-1", "p1", "p1-draft", "p1-missing"]) {
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
    await reviewCatalogVersion(db, {
      objectId: "EX-L001",
      contentVersion: CONTENT_VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
    });
    await publishCatalogVersionFlow(db, {
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
      await reviewCatalogVersion(db, {
        objectId,
        contentVersion: CONTENT_VERSION,
        reviewer: "reviewer-1",
        decision: "approved",
      });
      await expect(publishCatalogVersionFlow(db, {
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
    await db.doc(`${POLICIES}/synth-1`).delete();
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
    await setPolicy(db, "p1", {
      policyId: "p1",
      policyVersion: "p1",
      status: "published",
      objectIds: ["EX-L001"],
      ageBands: ["age8_10", "age14_16"],
      blockingRestrictions: ["no_high_impact"],
      blockingRecoveryFlags: ["injury"],
      knownRestrictions: ["no_high_impact"],
      knownRecoveryFlags: ["injury"],
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
    await setPolicy(db, "p1-draft", {
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

    await setPolicy(db, "p1-missing", {
      policyId: "p1-missing",
      status: "published",
      objectIds: ["EX-L080"],
      ageBands: ["age11_13"],
    });
    const missingVersion = await assess(db, "EX-L080", READY, { policyId: "p1-missing", policyVersion: "p1-missing" });
    expect(missingVersion).toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_INVALID"],
      policyVersion: null,
    });
  });

  it("E5 returns INPUT_MISSING:trainingAge", async () => {
    await setPolicy(db, "synth-1", synthPolicy());
    const result = await assess(db, "EX-L039", without("trainingAge"));
    expect(result).toEqual({
      decision: "review_required",
      reasonCodes: ["INPUT_MISSING:trainingAge"],
      policyVersion: "synth-1",
    });
  });

  it("E6a distinguishes a missing skills field from an empty skill list", async () => {
    await setPolicy(db, "synth-1", synthPolicy());
    const result = await assess(db, "EX-L001", without("verifiedSkills"));
    expect(result).toEqual({
      decision: "review_required",
      reasonCodes: ["INPUT_MISSING:verifiedSkills"],
      policyVersion: "synth-1",
    });
  });

  it("E6b returns NO_VERIFIED_SKILLS when the skill list is empty", async () => {
    await setPolicy(db, "synth-1", synthPolicy());
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
    await setPolicy(db, "synth-1", synthPolicy());
    const result = await assess(db, "EX-L078", without(field));
    expect(result).toEqual({
      decision: "review_required",
      reasonCodes: [reason],
      policyVersion: "synth-1",
    });
  });

  it("E8 and E9 return SUPERVISION_INSUFFICIENT when qualified or present is false", async () => {
    await setPolicy(db, "synth-1", synthPolicy());
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
    await setPolicy(db, "synth-1", synthPolicy());
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
    await setPolicy(db, "synth-1", synthPolicy());
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
    await setPolicy(db, "synth-1", synthPolicy());
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
    await setPolicy(db, "synth-1", synthPolicy());
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
