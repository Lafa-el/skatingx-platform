import {
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collectionGroup,
  doc,
  documentId,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { createRulesEnv, USERS } from "./helpers";

// Current rules allow a single profile read, and they do not allow a collection-group
// read of `profile` (scoped or not): "No matching allow statements". The selector
// treats that as a failed list and keeps showing the current athlete. This slice
// does not change firestore.rules.

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
    await setDoc(doc(db, `${USERS}/alice/athletes/lindsay/profile/main`), { displayName: "Lindsay" });
    await setDoc(doc(db, `${USERS}/alice/athletes/alex/profile/main`), { displayName: "Alex" });
  });
});

describe("profile collection group", () => {
  it("is denied for the owner, even when the query is limited to that owner's athletes", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const root = `${USERS}/alice/athletes/`;
    await assertFails(
      getDocs(
        query(
          collectionGroup(db, "profile"),
          where(documentId(), ">=", `${root}\u0000/profile/main`),
          where(documentId(), "<", `${root}\uf8ff/profile/main`),
        ),
      ),
    );
    await assertFails(getDocs(collectionGroup(db, "profile")));
  });
});
