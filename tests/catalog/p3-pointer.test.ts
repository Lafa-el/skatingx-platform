import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertProductionCommand,
  assessPointerSafety,
  contentHash,
  disablePolicyPointer,
  enablePolicyPointer,
  parseArgs,
  policyDocId,
  readPolicyPointer,
  rollbackPolicyPointer,
  showPolicyPointer,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const POLICIES = `${ROOT}/trainingCatalogSafetyPolicies`;
const POINTERS = `${ROOT}/trainingCatalogSafetyPolicyPointers`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const POLICY_ID = "youth-conditional-v1";
const OPERATOR = "policy-ops@example.com";
const OPTIONS = { operator: OPERATOR };

const RESTRICTIONS = [
  "medical_exercise_restriction",
  "no_high_impact",
  "active_lower_limb_injury",
  "current_joint_pain",
  "vascular_or_clotting_risk",
];
const RECOVERY = [
  "current_injury",
  "acute_illness",
  "significant_fatigue",
  "persistent_pain",
  "dizziness_or_fainting",
  "inadequate_recovery",
  "dehydration",
];
const OBJECTS = ["EX-L039", "EX-L078", "EX-L079", "EX-L080"] as const;

const ATHLETE = {
  ageBand: "age11_13",
  trainingAge: 2,
  verifiedSkills: ["controlled_landing_verified"],
  recentLoad: "low",
  recoveryFlags: [] as string[],
  supervision: { qualified: true, present: true },
  authorizedRestrictions: [] as string[],
};

/**
 * v1 is the real youth-conditional-v1 decision: drop jump stays in manual
 * review, and the three BFR exercises stay blocked.
 * v2 is a test policy, not a real policy. Its only decision change is EX-L039
 * conditional with a training age the fixture athlete already meets, so enable
 * and rollback are observable.
 */
function policy(version: "1" | "2", status = "published") {
  const testRelease = version === "2";
  const body = {
    policyId: POLICY_ID,
    policyVersion: version,
    status,
    reviewStatus: status === "published" ? "approved" : "pending",
    ...(status === "published"
      ? { reviewer: "reviewer-1", reviewedAt: "2026-11-18T00:00:00.000Z" }
      : {}),
    objectIds: [...OBJECTS],
    ageBands: ["age8_10", "age11_13", "age14_16"],
    knownRestrictions: [...RESTRICTIONS],
    blockingRestrictions: [...RESTRICTIONS],
    knownRecoveryFlags: [...RECOVERY],
    blockingRecoveryFlags: [...RECOVERY],
    objectConditions: [
      testRelease
        ? { objectId: "EX-L039", decisionMode: "conditional", minTrainingAgeYears: 1 }
        : { objectId: "EX-L039", decisionMode: "manual_review_only" },
      { objectId: "EX-L078", decisionMode: "blocked" },
      { objectId: "EX-L079", decisionMode: "blocked" },
      { objectId: "EX-L080", decisionMode: "blocked" },
    ],
  };
  if (status !== "published") return body;
  return { ...body, reviewedContentSha256: contentHash(body) };
}

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-p3-pointer");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-p3-pointer");
  return getFirestore(app);
}

async function reset(db: Firestore): Promise<void> {
  const batch = db.batch();
  batch.delete(db.doc(`${POINTERS}/${POLICY_ID}`));
  for (const version of ["1", "2", "3", "4", "5", "9", "missing"]) {
    batch.delete(db.doc(`${POLICIES}/${policyDocId(POLICY_ID, version)}`));
  }
  const logs = await db.collection(AUDIT).where("target.id", "==", POLICY_ID).get();
  for (const item of logs.docs) batch.delete(item.ref);
  await batch.commit();
}

async function seed(db: Firestore, version: "1" | "2", status = "published"): Promise<void> {
  const body = policy(version, status);
  await db.doc(`${POLICIES}/${policyDocId(POLICY_ID, version)}`).set(body);
}

async function audits(db: Firestore, action?: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(AUDIT).where("target.id", "==", POLICY_ID).get();
  const rows = snap.docs.map((item) => item.data());
  return action === undefined ? rows : rows.filter((entry) => entry.action === action);
}

function assess(db: Firestore, objectId: string) {
  return assessPointerSafety(db, { objectId, policyId: POLICY_ID, ...ATHLETE });
}

describe("P3-10 safety policy pointer", () => {
  let db: Firestore;

  beforeAll(() => {
    expect(PROJECT_ID.startsWith("demo-")).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
  });

  beforeEach(async () => {
    await reset(db);
  });

  afterAll(async () => {
    if (db) await reset(db);
  });

  it("T-01 enables a published version and evaluates through the pointer", async () => {
    await seed(db, "1");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);

    const status = await showPolicyPointer(db, { policyId: POLICY_ID });
    expect(status).toMatchObject({
      policyId: POLICY_ID,
      activePolicyVersion: "1",
      previousPolicyVersion: null,
      revision: 1,
      updatedBy: OPERATOR,
      reason: "enable v1",
    });
    expect(typeof status?.updatedAt).toBe("string");
    const enabled = (await audits(db, "policy_enable")).filter((entry) => entry.result === "ok");
    expect(enabled).toEqual([
      expect.objectContaining({
        action: "policy_enable",
        actor: OPERATOR,
        result: "ok",
        detail: "enable v1",
        target: { collection: "trainingCatalogSafetyPolicyPointers", id: POLICY_ID },
      }),
    ]);
    await expect(assess(db, "EX-L078")).resolves.toMatchObject({
      decision: "block",
      reasonCodes: ["OBJECT_BLOCKED"],
      policyVersion: "1",
      pointerState: "enabled",
      alertEvents: [],
    });
    await expect(assess(db, "EX-L039")).resolves.toMatchObject({
      decision: "review_required",
      reasonCodes: ["MANUAL_REVIEW_ONLY"],
      pointerState: "enabled",
      alertEvents: [],
    });
  });

  it("T-02 rejects a missing version and leaves the pointer unwritten", async () => {
    await expect(enablePolicyPointer(db, {
      policyId: POLICY_ID,
      policyVersion: "9",
      reason: "missing",
    }, OPTIONS)).rejects.toThrow(/policy does not exist/);
    await expect(readPolicyPointer(db, POLICY_ID)).resolves.toBeNull();
    const rejected = (await audits(db, "policy_enable")).filter((entry) => entry.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.detail)).toMatch(/policy does not exist/);
  });

  it("T-03 rejects a draft version", async () => {
    await seed(db, "1", "draft");
    await expect(enablePolicyPointer(db, {
      policyId: POLICY_ID,
      policyVersion: "1",
      reason: "draft",
    }, OPTIONS)).rejects.toThrow(/status must be published/);
    await expect(readPolicyPointer(db, POLICY_ID)).resolves.toBeNull();
  });

  it("T-04 rejects a published policy that does not parse", async () => {
    const { objectConditions: _conditions, ...invalid } = policy("1");
    await db.doc(`${POLICIES}/${policyDocId(POLICY_ID, "1")}`).set(invalid);
    await expect(enablePolicyPointer(db, {
      policyId: POLICY_ID,
      policyVersion: "1",
      reason: "invalid",
    }, OPTIONS)).rejects.toThrow(/safety policy is invalid/);
    await expect(readPolicyPointer(db, POLICY_ID)).resolves.toBeNull();
  });

  it("T-05 reports an intentional disable without M-E1", async () => {
    await expect(assess(db, "EX-L078")).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
      pointerState: "disabled",
      alertEvents: [],
    });
    await seed(db, "1");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
    await disablePolicyPointer(db, { policyId: POLICY_ID, reason: "stop" }, OPTIONS);
    const pointer = await readPolicyPointer(db, POLICY_ID);
    expect(pointer?.activePolicyVersion).toBeNull();
    expect(pointer?.previousPolicyVersion).toBe("1");
    expect(pointer?.revision).toBe(2);
    await expect(assess(db, "EX-L039")).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
      pointerState: "disabled",
      alertEvents: [],
    });
  });

  it("T-06 rolls v2 back to v1", async () => {
    await seed(db, "1");
    await seed(db, "2");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "2", reason: "enable test v2" }, OPTIONS);
    expect((await readPolicyPointer(db, POLICY_ID))?.revision).toBe(2);
    await expect(assess(db, "EX-L039")).resolves.toMatchObject({
      decision: "allow_with_supervision",
      reasonCodes: ["POLICY_SATISFIED"],
      pointerState: "enabled",
      alertEvents: ["M-E3"],
    });

    await rollbackPolicyPointer(db, {
      policyId: POLICY_ID,
      expectedRevision: 2,
      reason: "roll back",
    }, OPTIONS);
    const pointer = await readPolicyPointer(db, POLICY_ID);
    expect(pointer?.activePolicyVersion).toBe("1");
    expect(pointer?.previousPolicyVersion).toBe("2");
    expect(pointer?.revision).toBe(3);
    await expect(assess(db, "EX-L039")).resolves.toMatchObject({
      decision: "review_required",
      reasonCodes: ["MANUAL_REVIEW_ONLY"],
      alertEvents: [],
    });
    await expect(assess(db, "EX-L078")).resolves.toMatchObject({
      decision: "block",
      reasonCodes: ["OBJECT_BLOCKED"],
    });
    const rolled = (await audits(db, "policy_rollback")).filter((entry) => entry.result === "ok");
    expect(rolled).toHaveLength(1);
  });

  it("T-07 rejects rollback when there is no previous version", async () => {
    await seed(db, "1");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
    await expect(rollbackPolicyPointer(db, {
      policyId: POLICY_ID,
      expectedRevision: 1,
      reason: "no previous",
    }, OPTIONS)).rejects.toThrow(/previousPolicyVersion is not set/);
    const pointer = await readPolicyPointer(db, POLICY_ID);
    expect(pointer?.activePolicyVersion).toBe("1");
    expect(pointer?.previousPolicyVersion).toBeNull();
    expect(pointer?.revision).toBe(1);
  });

  it("T-08 raises M-E1 when the active version document is gone", async () => {
    await db.doc(`${POINTERS}/${POLICY_ID}`).set({
      policyId: POLICY_ID,
      activePolicyVersion: "missing",
      previousPolicyVersion: null,
      revision: 1,
      updatedBy: OPERATOR,
      updatedAt: "2026-11-18T00:00:00.000Z",
      reason: "point at nothing",
    });
    await expect(assess(db, "EX-L078")).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
      pointerState: "error",
      alertEvents: ["M-E1"],
    });
  });

  it("T-09 treats an empty active version as disabled", async () => {
    await db.doc(`${POINTERS}/${POLICY_ID}`).set({
      policyId: POLICY_ID,
      activePolicyVersion: "",
      previousPolicyVersion: "1",
      revision: 2,
      updatedBy: OPERATOR,
      updatedAt: "2026-11-18T00:00:00.000Z",
      reason: "blank",
    });
    await expect(assess(db, "EX-L080")).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
      pointerState: "disabled",
      alertEvents: [],
    });
  });

  it("T-10 refuses a missing reason, a non-integer revision, and accepts the CLI keys", async () => {
    await seed(db, "1");
    await expect(enablePolicyPointer(db, {
      policyId: POLICY_ID,
      policyVersion: "1",
    } as never, OPTIONS)).rejects.toThrow(/reason is required/);
    await expect(enablePolicyPointer(db, {
      policyId: POLICY_ID,
      policyVersion: "1",
      reason: "   ",
    }, OPTIONS)).rejects.toThrow(/reason is required/);
    await expect(rollbackPolicyPointer(db, {
      policyId: POLICY_ID,
      reason: "rollback",
    } as never, OPTIONS)).rejects.toThrow(/expectedRevision must be an integer/);
    await expect(rollbackPolicyPointer(db, {
      policyId: POLICY_ID,
      expectedRevision: "1.5",
      reason: "rollback",
    }, OPTIONS)).rejects.toThrow(/expectedRevision must be an integer/);
    await expect(readPolicyPointer(db, POLICY_ID)).resolves.toBeNull();
    expect(await audits(db)).toEqual([]);
    expect(parseArgs([
      "policy-enable",
      "--policyId",
      POLICY_ID,
      "--policyVersion",
      "1",
      "--reason",
      "enable v1",
    ]).args.reason).toBe("enable v1");
    expect(parseArgs([
      "policy-rollback",
      "--policyId",
      POLICY_ID,
      "--expectedRevision",
      "2",
      "--reason",
      "roll back",
    ]).args.expectedRevision).toBe("2");
    for (const command of ["policy-enable", "policy-disable", "policy-rollback", "policy-status"]) {
      expect(() => assertProductionCommand(command)).not.toThrow();
    }
  });

  it("T-13 keeps the pointer still when the same version is enabled again", async () => {
    await seed(db, "1");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
    const before = await readPolicyPointer(db, POLICY_ID);
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "again" }, OPTIONS);
    await expect(readPolicyPointer(db, POLICY_ID)).resolves.toEqual(before);
    const ok = (await audits(db, "policy_enable")).filter((entry) => entry.result === "ok");
    expect(ok).toHaveLength(2);
    expect(ok).toEqual(expect.arrayContaining([
      expect.objectContaining({ detail: "enable v1", changed: true }),
      expect.objectContaining({ detail: "already enabled at version 1, no change", changed: false }),
    ]));
    expect(before?.revision).toBe(1);
    expect(before?.previousPolicyVersion).toBeNull();
    expect(before?.activePolicyVersion).toBe("1");
  });

  it("T-14 keeps the pointer still when disable is repeated", async () => {
    await seed(db, "1");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
    await disablePolicyPointer(db, { policyId: POLICY_ID, reason: "stop" }, OPTIONS);
    const before = await readPolicyPointer(db, POLICY_ID);
    await disablePolicyPointer(db, { policyId: POLICY_ID, reason: "stop again" }, OPTIONS);
    await expect(readPolicyPointer(db, POLICY_ID)).resolves.toEqual(before);
    expect(before?.revision).toBe(2);
    expect(before?.previousPolicyVersion).toBe("1");
    expect(before?.activePolicyVersion).toBeNull();
    const ok = (await audits(db, "policy_disable")).filter((entry) => entry.result === "ok");
    expect(ok).toHaveLength(2);
    expect(ok).toEqual(expect.arrayContaining([
      expect.objectContaining({ detail: "stop", changed: true }),
      expect.objectContaining({ detail: "already disabled, no change", changed: false }),
    ]));
  });

  it("T-15 rejects a second rollback that reuses the same revision", async () => {
    await seed(db, "1");
    await seed(db, "2");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "2", reason: "enable test v2" }, OPTIONS);
    const attempt = () => rollbackPolicyPointer(db, {
      policyId: POLICY_ID,
      expectedRevision: 2,
      reason: "retry",
    }, OPTIONS);
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((entry) => entry.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(String(rejected.reason)).toMatch(
        /pointer revision mismatch: expected 2, found 3 — re-read the pointer and retry/,
      );
    }
    const pointer = await readPolicyPointer(db, POLICY_ID);
    expect(pointer?.activePolicyVersion).toBe("1");
    expect(pointer?.previousPolicyVersion).toBe("2");
    expect(pointer?.revision).toBe(3);
  });

  it("T-16 rejects rollback when the previous version is not a usable policy", async () => {
    async function arm(): Promise<void> {
      await reset(db);
      await seed(db, "1");
      await seed(db, "2");
      await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
      await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "2", reason: "enable test v2" }, OPTIONS);
    }
    await arm();
    await db.doc(`${POLICIES}/${policyDocId(POLICY_ID, "1")}`).delete();
    await expect(rollbackPolicyPointer(db, {
      policyId: POLICY_ID,
      expectedRevision: 2,
      reason: "missing target",
    }, OPTIONS)).rejects.toThrow(/policy does not exist/);
    expect((await readPolicyPointer(db, POLICY_ID))?.activePolicyVersion).toBe("2");
    expect((await readPolicyPointer(db, POLICY_ID))?.revision).toBe(2);

    await arm();
    await db.doc(`${POLICIES}/${policyDocId(POLICY_ID, "1")}`).update({ status: "draft" });
    await expect(rollbackPolicyPointer(db, {
      policyId: POLICY_ID,
      expectedRevision: 2,
      reason: "draft target",
    }, OPTIONS)).rejects.toThrow(/status must be published/);
    expect((await readPolicyPointer(db, POLICY_ID))?.revision).toBe(2);

    await arm();
    const { objectConditions: _conditions, ...invalid } = policy("1");
    await db.doc(`${POLICIES}/${policyDocId(POLICY_ID, "1")}`).set(invalid);
    await expect(rollbackPolicyPointer(db, {
      policyId: POLICY_ID,
      expectedRevision: 2,
      reason: "invalid target",
    }, OPTIONS)).rejects.toThrow(/safety policy is invalid/);
    expect((await readPolicyPointer(db, POLICY_ID))?.activePolicyVersion).toBe("2");
    expect((await readPolicyPointer(db, POLICY_ID))?.revision).toBe(2);
  });

  it("T-17 rejects a policy document whose identity fields do not match", async () => {
    await db.doc(`${POLICIES}/${policyDocId(POLICY_ID, "1")}`).set({
      ...policy("1"),
      policyVersion: "999",
    });
    await expect(enablePolicyPointer(db, {
      policyId: POLICY_ID,
      policyVersion: "1",
      reason: "wrong version field",
    }, OPTIONS)).rejects.toThrow(/policyVersion does not match the policy document/);
    await expect(readPolicyPointer(db, POLICY_ID)).resolves.toBeNull();

    await db.doc(`${POLICIES}/${policyDocId(POLICY_ID, "1")}`).set({
      ...policy("1"),
      policyId: "other-policy",
    });
    await expect(enablePolicyPointer(db, {
      policyId: POLICY_ID,
      policyVersion: "1",
      reason: "wrong policy id",
    }, OPTIONS)).rejects.toThrow(/policyId does not match the policy document/);
    await expect(readPolicyPointer(db, POLICY_ID)).resolves.toBeNull();
  });

  it("T-19 does not evaluate the previous version after disable", async () => {
    await seed(db, "1");
    await seed(db, "2");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "2", reason: "enable test v2" }, OPTIONS);
    await disablePolicyPointer(db, { policyId: POLICY_ID, reason: "stop" }, OPTIONS);
    const pointer = await readPolicyPointer(db, POLICY_ID);
    expect(pointer?.activePolicyVersion).toBeNull();
    expect(pointer?.previousPolicyVersion).toBe("2");
    for (const objectId of OBJECTS) {
      await expect(assess(db, objectId)).resolves.toEqual({
        decision: "review_required",
        reasonCodes: ["POLICY_MISSING"],
        policyVersion: null,
        pointerState: "disabled",
        alertEvents: [],
      });
    }
  });

  it("T-20 raises M-E3 when a test policy releases a conditional exercise", async () => {
    await seed(db, "2");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "2", reason: "enable test v2" }, OPTIONS);
    await expect(assess(db, "EX-L039")).resolves.toMatchObject({
      decision: "allow_with_supervision",
      reasonCodes: ["POLICY_SATISFIED"],
      policyVersion: "2",
      pointerState: "enabled",
      alertEvents: ["M-E3"],
    });
    await expect(assess(db, "EX-L078")).resolves.toMatchObject({
      decision: "block",
      reasonCodes: ["OBJECT_BLOCKED"],
      pointerState: "enabled",
      alertEvents: [],
    });
  });

  it("a broken pointer or a failed read is M-E1, and an unparseable active policy is M-E2", async () => {
    await db.doc(`${POINTERS}/${POLICY_ID}`).set({
      policyId: "other-policy",
      activePolicyVersion: "1",
      previousPolicyVersion: null,
      revision: 1,
      updatedBy: OPERATOR,
      updatedAt: "2026-11-18T00:00:00.000Z",
      reason: "wrong id",
    });
    await expect(assess(db, "EX-L039")).resolves.toMatchObject({
      pointerState: "error",
      alertEvents: ["M-E1"],
      reasonCodes: ["POLICY_MISSING"],
    });

    await db.doc(`${POINTERS}/${POLICY_ID}`).set({
      policyId: POLICY_ID,
      activePolicyVersion: 1,
      previousPolicyVersion: null,
      revision: 1,
      updatedBy: OPERATOR,
      updatedAt: "2026-11-18T00:00:00.000Z",
      reason: "number",
    });
    await expect(assess(db, "EX-L039")).resolves.toMatchObject({ alertEvents: ["M-E1"] });

    const { objectConditions: _conditions, ...invalid } = policy("1");
    await db.doc(`${POLICIES}/${policyDocId(POLICY_ID, "1")}`).set(invalid);
    await db.doc(`${POINTERS}/${POLICY_ID}`).set({
      policyId: POLICY_ID,
      activePolicyVersion: "1",
      previousPolicyVersion: null,
      revision: 1,
      updatedBy: OPERATOR,
      updatedAt: "2026-11-18T00:00:00.000Z",
      reason: "bad policy",
    });
    await expect(assess(db, "EX-L078")).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_INVALID"],
      policyVersion: "1",
      pointerState: "error",
      alertEvents: ["M-E2"],
    });

    await expect(assessPointerSafety(db, { objectId: "EX-L078", policyId: POLICY_ID, ...ATHLETE }, {
      readPointer: () => Promise.reject(new Error("permission denied")),
    })).resolves.toMatchObject({ pointerState: "error", alertEvents: ["M-E1"] });
    await expect(assessPointerSafety(db, { objectId: "EX-L078", policyId: POLICY_ID, ...ATHLETE }, {
      readPointer: () => new Promise(() => {}),
      timeoutMs: 20,
    })).resolves.toMatchObject({ pointerState: "error", alertEvents: ["M-E1"], reasonCodes: ["POLICY_MISSING"] });
  });

  it("treats a broken disabled pointer as M-E1", async () => {
    await db.doc(`${POINTERS}/${POLICY_ID}`).set({
      policyId: "other-policy",
      activePolicyVersion: null,
      previousPolicyVersion: null,
      revision: 1,
      updatedAt: "2026-11-18T00:00:00.000Z",
      reason: "broken",
    });
    await expect(assess(db, "EX-L039")).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
      pointerState: "error",
      alertEvents: ["M-E1"],
    });

    await db.doc(`${POINTERS}/${POLICY_ID}`).set({
      policyId: POLICY_ID,
      activePolicyVersion: "",
      previousPolicyVersion: null,
      revision: 1.5,
      updatedBy: OPERATOR,
      updatedAt: "2026-11-18T00:00:00.000Z",
      reason: "blank",
    });
    await expect(assess(db, "EX-L078")).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
      pointerState: "error",
      alertEvents: ["M-E1"],
    });
  });

  it("keeps a complete disabled pointer as a normal disable", async () => {
    await db.doc(`${POINTERS}/${POLICY_ID}`).set({
      policyId: POLICY_ID,
      activePolicyVersion: null,
      previousPolicyVersion: "1",
      revision: 2,
      updatedBy: OPERATOR,
      updatedAt: "2026-11-18T00:00:00.000Z",
      reason: "disabled",
    });
    await expect(assess(db, "EX-L080")).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
      pointerState: "disabled",
      alertEvents: [],
    });
  });

  it("rejects enable when the stored policy no longer matches its reviewed digest", async () => {
    await seed(db, "1");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
    expect((await readPolicyPointer(db, POLICY_ID))?.activePolicyVersion).toBe("1");

    const before = await readPolicyPointer(db, POLICY_ID);
    await db.doc(`${POLICIES}/${policyDocId(POLICY_ID, "1")}`).update({ ageBands: ["age8_10"] });
    await expect(enablePolicyPointer(db, {
      policyId: POLICY_ID,
      policyVersion: "1",
      reason: "enable after edit",
    }, OPTIONS)).rejects.toThrow(/content changed since review/);
    expect(await readPolicyPointer(db, POLICY_ID)).toEqual(before);
  });

  it("rejects a reader result whose policy identity does not match the request", async () => {
    await seed(db, "1");
    await enablePolicyPointer(db, { policyId: POLICY_ID, policyVersion: "1", reason: "enable v1" }, OPTIONS);
    const body = policy("1");
    const request = { objectId: "EX-L039", policyId: POLICY_ID, ...ATHLETE };
    await expect(assessPointerSafety(db, request, {
      readPolicy: async () => ({ ...body, policyVersion: "2" }),
    })).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
      pointerState: "error",
      alertEvents: ["M-E1"],
    });
    await expect(assessPointerSafety(db, request, {
      readPolicy: async () => ({ ...body, policyId: "other-policy" }),
    })).resolves.toEqual({
      decision: "review_required",
      reasonCodes: ["POLICY_MISSING"],
      policyVersion: null,
      pointerState: "error",
      alertEvents: ["M-E1"],
    });
  });
});
