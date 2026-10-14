import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { createRulesEnv, USERS } from "./helpers";

// Access control, as deployed on 2026-10-14 (owner-only under the user's subtree).
// These tests pin the CURRENT behavior and must keep passing when race-day rules are
// added: new rules may narrow `raceDay/**` but must not change anything else.

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

// Paths the app uses today, plus one collection the app does not use, to pin that
// unknown collections under the user's subtree stay owner-accessible.
const EXISTING_PATHS = [
  "settings/main",
  "athletes/lindsay/profile/main",
  "athletes/lindsay/gamification/main",
  "athletes/lindsay/training/state",
  "athletes/lindsay/training/main/records/500m",
  "athletes/lindsay/training/main/rewards/catalog",
  "athletes/lindsay/analysis/sessions/s1/summary",
  "unusedCollection/anything",
];

describe.each(EXISTING_PATHS)("existing path %s", (suffix) => {
  const path = `${USERS}/alice/${suffix}`;

  it("lets the owner read and write", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(db, path), { n: 1 }));
    await assertSucceeds(getDoc(doc(db, path)));
  });

  it("denies another signed-in user", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), { n: 1 });
    });
    const db = env.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), { n: 2 }));
  });

  it("denies unauthenticated access", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), { n: 3 }));
  });
});

describe("paths outside the owner's subtree", () => {
  it.each([
    ["another app id", "artifacts/other-app/users/alice/settings/main"],
    ["a sibling of users under the app id", "artifacts/skatingx-production/shared/doc"],
    ["a top-level collection", "somewhere/doc"],
  ])("denies even a signed-in owner: %s", async (_label, path) => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(db, path), { n: 1 }));
    await assertFails(getDoc(doc(db, path)));
  });
});
