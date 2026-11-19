import { assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { catalogAdminContext, createRulesEnv } from "./helpers";

const POINTERS = "artifacts/skatingx-production/trainingCatalogSafetyPolicyPointers";
const POINTER = `${POINTERS}/youth-conditional-v1`;

const POINTER_BODY = {
  policyId: "youth-conditional-v1",
  activePolicyVersion: "1",
  previousPolicyVersion: null,
  revision: 1,
  updatedBy: "policy-ops@example.com",
  updatedAt: "2026-11-18T00:00:00.000Z",
  reason: "seed",
};

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), POINTER), POINTER_BODY);
  });
});

describe("safety policy pointer rules", () => {
  it("T-11 denies a signed-in client create, update, and delete", async () => {
    const db = env.authenticatedContext("skater").firestore();
    await assertFails(setDoc(doc(db, `${POINTERS}/new-pointer`), POINTER_BODY));
    await assertFails(updateDoc(doc(db, POINTER), { reason: "client edit" }));
    await assertFails(deleteDoc(doc(db, POINTER)));
    let reason: unknown;
    await env.withSecurityRulesDisabled(async (context) => {
      reason = (await getDoc(doc(context.firestore(), POINTER))).data()?.reason;
    });
    expect(reason).toBe("seed");
  });

  it("T-12 denies a signed-in client get and list", async () => {
    const db = env.authenticatedContext("skater").firestore();
    await assertFails(getDoc(doc(db, POINTER)));
    await assertFails(getDocs(collection(db, POINTERS)));
  });

  it("T-18 denies catalogAdmin get, list, create, update, and delete", async () => {
    const db = catalogAdminContext(env, "admin").firestore();
    await assertFails(getDoc(doc(db, POINTER)));
    await assertFails(getDocs(collection(db, POINTERS)));
    await assertFails(setDoc(doc(db, `${POINTERS}/admin-pointer`), POINTER_BODY));
    await assertFails(updateDoc(doc(db, POINTER), { reason: "admin edit" }));
    await assertFails(deleteDoc(doc(db, POINTER)));
  });
});
