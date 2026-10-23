import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, limit, query, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { createRulesEnv, USERS } from "./helpers";

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

// athletes/{athleteId}/pointsLedger/{eventId} is two segments under the athlete,
// which the existing owner `{a}/{b}` rule already allows. This slice does not change rules.
const path = `${USERS}/alice/athletes/lindsay/pointsLedger/opening`;

const event = {
  dateId: "2026-10-23",
  delta: 40,
  reason: "opening-balance",
  createdAt: "2026-10-23T16:00:00.000Z",
};

describe("athletes/{athleteId}/pointsLedger/{eventId}", () => {
  it("lets the owner write, read, and list a ledger event", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(db, path), event));
    await assertSucceeds(getDoc(doc(db, path)));
    await assertSucceeds(getDocs(query(collection(db, `${USERS}/alice/athletes/lindsay/pointsLedger`), limit(1))));
  });

  it("refuses another account", async () => {
    const owner = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(owner, path), event));
    const other = env.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(other, path)));
    await assertFails(setDoc(doc(other, path), { ...event, delta: 1 }));
    await assertFails(getDocs(query(collection(other, `${USERS}/alice/athletes/lindsay/pointsLedger`), limit(1))));
  });
});
