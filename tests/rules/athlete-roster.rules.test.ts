import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  type QuerySnapshot,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRulesEnv, USERS } from "./helpers";

// The recursive `profile` match allows a collection-group list only when the
// query filters `userId` to the signed-in user. A single profile read stays on
// the owner rule.

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${USERS}/alice/athletes/lindsay/profile/main`), {
      displayName: "Lindsay",
      userId: "alice",
    });
    await setDoc(doc(db, `${USERS}/alice/athletes/alex/profile/main`), {
      displayName: "Alex",
      userId: "alice",
    });
    await setDoc(doc(db, `${USERS}/bob/athletes/bob/profile/main`), {
      displayName: "Bob",
      userId: "bob",
    });
    await setDoc(doc(db, `${USERS}/alice/athletes/legacy/profile/main`), {
      displayName: "Legacy",
    });
  });
});

function profilesFor(userId: string) {
  return query(
    collectionGroup(env.authenticatedContext("alice").firestore(), "profile"),
    where("userId", "==", userId),
  );
}

describe("profile collection group", () => {
  it("lets the owner list profiles whose userId is their own", async () => {
    const snap = await assertSucceeds(getDocs(profilesFor("alice")));
    const names = (snap as QuerySnapshot).docs
      .map((item) => String(item.get("displayName")))
      .sort();
    expect(names).toEqual(["Alex", "Lindsay"]);
  });

  it("denies a collection-group list that does not filter on userId", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDocs(collectionGroup(db, "profile")));
  });

  it("denies a list filtered to another user's id", async () => {
    await assertFails(getDocs(profilesFor("bob")));
  });

  it("still lets the owner read one profile document", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const snap = await assertSucceeds(
      getDoc(doc(db, `${USERS}/alice/athletes/lindsay/profile/main`)),
    );
    expect(snap.get("displayName")).toBe("Lindsay");
  });
});
