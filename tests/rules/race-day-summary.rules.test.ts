import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { RaceSummaryDoc } from "@skatingx/schema";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createRace,
  createRaceEvent,
  createRaceSummary,
  createRosterEntry,
  deleteRace,
  deleteRaceEvent,
  deleteRaceSummary,
  deleteRosterEntry,
  RaceDayValidationError,
  subscribeToRaceSummary,
  updateRaceSummary,
  type RaceDayContext,
  type RaceDayListError,
  type RaceSummaryState,
} from "../../packages/firebase-client/src/firestore/race-day";
import { createRulesEnv, USERS } from "./helpers";

// REAL repository code against the emulator with the REAL firestore.rules (see
// race-day-repository.rules.test.ts). The summary document holds only the user's note: the
// numbers on the card are computed from results and never stored. Fixtures are obviously fake.

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

const modularDb = (db: unknown): Firestore => db as Firestore;
const asUser = (uid: string, owner = uid): RaceDayContext => ({
  db: modularDb(env.authenticatedContext(uid).firestore()),
  userId: owner,
});
const alice = () => asUser("alice");

const eventInput = {
  name: "Test Championships",
  dates: ["2026-10-24", "2026-10-25"],
  timeZone: "America/New_York",
  venue: null,
  sourceNote: "fixture",
};
const rosterInput = (over = {}) => ({
  displayName: "Test Skater",
  bib: "000",
  division: "Test Division",
  isSelf: true,
  isFollowed: false,
  athleteRefId: null,
  sourceNote: "",
  ...over,
});
const raceInput = (over = {}) => ({
  distanceId: "500m",
  label: "500m",
  sortOrder: 1,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: [],
  sourceNote: "",
  ...over,
});

const summaryPath = (uid: string, eventId: string, id = "main") =>
  `${USERS}/${uid}/raceDay/${eventId}/summaries/${id}`;

function nextSummaryState(
  ctx: RaceDayContext,
  eventId: string,
  ready: (state: RaceSummaryState) => boolean = () => true,
): Promise<RaceSummaryState> {
  return new Promise((resolve, reject) => {
    let stop: Unsubscribe = () => undefined;
    const timer = setTimeout(() => {
      stop();
      reject(new Error("timed out waiting for the expected snapshot"));
    }, 8000);
    stop = subscribeToRaceSummary(
      ctx,
      eventId,
      (state) => {
        if (ready(state)) {
          clearTimeout(timer);
          stop();
          resolve(state);
        }
      },
      (error: RaceDayListError) => {
        clearTimeout(timer);
        stop();
        reject(new Error(`${error.code}: ${error.message}`));
      },
    );
  });
}

const summaryOf = async (ctx: RaceDayContext, eventId: string): Promise<RaceSummaryDoc> => {
  const state = await nextSummaryState(ctx, eventId, (s) => s.kind !== "none");
  if (state.kind !== "ready") {
    throw new Error(`expected a readable summary, got ${state.kind}`);
  }
  return state.summary;
};

const exists = async (ctx: RaceDayContext, eventId: string) =>
  (await getDoc(doc(ctx.db, summaryPath(ctx.userId, eventId)))).exists();

/** A stored summary as the rules require it, for tests that bypass the repository. */
const rawSummary = (over: Record<string, unknown> = {}) => {
  const now = Timestamp.fromDate(new Date("2026-10-24T12:00:00Z"));
  return {
    summaryVersion: "race-summary/1",
    generatedAt: now,
    coachNote: "note",
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
};

async function seed(ctx: RaceDayContext, eventId = "ev") {
  await createRaceEvent(ctx, eventInput, { eventId });
  const me = await createRosterEntry(ctx, eventId, rosterInput(), { rosterId: "sk-me" });
  const race = await createRace(ctx, eventId, raceInput({ rosterIds: [me] }), { raceId: "race-1" });
  return { eventId, me, race };
}

describe("summary notes written by the repository are accepted by the real rules", () => {
  it("has no summary until a note is saved", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    expect(await nextSummaryState(ctx, eventId)).toEqual({ kind: "none" });
  });

  it("creates the note with exactly the keys the rules demand, and reads it back", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);

    await assertSucceeds(createRaceSummary(ctx, eventId, { coachNote: "  Fast start, tired late  " }));

    const summary = await summaryOf(ctx, eventId);
    expect(summary).toMatchObject({
      summaryVersion: "race-summary/1",
      coachNote: "Fast start, tired late",
      schemaVersion: 1,
    });
    expect(summary.generatedAt).not.toBeNull();

    const snap = await getDoc(doc(ctx.db, summaryPath("alice", eventId)));
    expect(Object.keys(snap.data() ?? {}).sort()).toEqual(
      ["coachNote", "createdAt", "generatedAt", "schemaVersion", "summaryVersion", "updatedAt"].sort(),
    );
    const data = snap.data() ?? {};
    expect(data.createdAt).toBeInstanceOf(Timestamp);
    expect(data.generatedAt).toBeInstanceOf(Timestamp);
  });

  it("an empty note is stored as null, not as an empty string", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await assertSucceeds(createRaceSummary(ctx, eventId, { coachNote: "   " }));
    const snap = await getDoc(doc(ctx.db, summaryPath("alice", eventId)));
    expect(snap.data()?.coachNote).toBeNull();
  });

  it("accepts a note of exactly the limit", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await assertSucceeds(createRaceSummary(ctx, eventId, { coachNote: "n".repeat(2000) }));
    expect((await summaryOf(ctx, eventId)).coachNote).toHaveLength(2000);
  });

  it("a second create cannot overwrite the first: it counts as an update that moves createdAt", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await createRaceSummary(ctx, eventId, { coachNote: "first" });
    await assertFails(createRaceSummary(ctx, eventId, { coachNote: "second" }));
    expect((await summaryOf(ctx, eventId)).coachNote).toBe("first");
  });

  it("update changes the note, keeps createdAt and advances updatedAt and generatedAt", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await createRaceSummary(ctx, eventId, { coachNote: "first" });
    const before = await summaryOf(ctx, eventId);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await assertSucceeds(updateRaceSummary(ctx, eventId, { coachNote: "second" }));

    const after = await summaryOf(ctx, eventId);
    expect(after.coachNote).toBe("second");
    expect(after.createdAt).toBe(before.createdAt);
    expect(Date.parse(after.updatedAt ?? "")).toBeGreaterThan(Date.parse(before.updatedAt ?? ""));
    expect(Date.parse(after.generatedAt ?? "")).toBeGreaterThan(Date.parse(before.generatedAt ?? ""));
  });

  it("update can clear the note without deleting the document", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await createRaceSummary(ctx, eventId, { coachNote: "first" });
    await assertSucceeds(updateRaceSummary(ctx, eventId, { coachNote: "" }));
    expect((await summaryOf(ctx, eventId)).coachNote).toBeNull();
    expect(await exists(ctx, eventId)).toBe(true);
  });

  it("updating a summary that does not exist is refused", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await assertFails(updateRaceSummary(ctx, eventId, { coachNote: "x" }));
  });

  it("delete removes the summary; deleting when there is none is harmless", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await createRaceSummary(ctx, eventId, { coachNote: "first" });
    await assertSucceeds(deleteRaceSummary(ctx, eventId));
    expect(await nextSummaryState(ctx, eventId)).toEqual({ kind: "none" });
    await assertSucceeds(deleteRaceSummary(ctx, eventId));
  });
});

describe("validation happens before any write", () => {
  it("rejects a note over the limit and writes nothing", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await expect(createRaceSummary(ctx, eventId, { coachNote: "n".repeat(2001) })).rejects.toBeInstanceOf(
      RaceDayValidationError,
    );
    expect(await exists(ctx, eventId)).toBe(false);
  });

  it("an over-limit update leaves the saved note unchanged", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await createRaceSummary(ctx, eventId, { coachNote: "keep" });
    await expect(updateRaceSummary(ctx, eventId, { coachNote: "n".repeat(2001) })).rejects.toBeInstanceOf(
      RaceDayValidationError,
    );
    expect((await summaryOf(ctx, eventId)).coachNote).toBe("keep");
  });

  it("rejects an invalid event id", async () => {
    await expect(createRaceSummary(alice(), "Bad Id/../x", { coachNote: "x" })).rejects.toThrow();
  });
});

describe("the rules keep the summary to the note", () => {
  const raw = (ctx: RaceDayContext, eventId: string, id = "main") => doc(ctx.db, summaryPath(ctx.userId, eventId, id));

  it("accepts a plain document", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await assertSucceeds(setDoc(raw(ctx, eventId), rawSummary()));
  });

  it("only the document named main exists: any other id is refused", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await assertFails(setDoc(raw(ctx, eventId, "other"), rawSummary()));
    await assertFails(setDoc(raw(ctx, eventId, "Main"), rawSummary()));
  });

  it.each([
    ["an extra key", { extra: "x" }],
    ["a stored result snapshot", { items: [] }],
    ["a note over the limit", { coachNote: "n".repeat(2001) }],
    ["a note that is not text", { coachNote: 5 }],
    ["a version over the limit", { summaryVersion: "v".repeat(41) }],
    ["a generatedAt that is not a time", { generatedAt: "2026-10-24" }],
    ["a wrong schemaVersion", { schemaVersion: 2 }],
  ])("refuses %s", async (_name, over) => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await assertFails(setDoc(raw(ctx, eventId), rawSummary(over)));
  });

  it("refuses a document with a missing key", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    const { coachNote: _omitted, ...withoutNote } = rawSummary();
    await assertFails(setDoc(raw(ctx, eventId), withoutNote));
  });

  it("accepts a null note and a null generatedAt", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await assertSucceeds(setDoc(raw(ctx, eventId), rawSummary({ coachNote: null, generatedAt: null })));
  });

  it("refuses an update that changes createdAt", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await setDoc(raw(ctx, eventId), rawSummary());
    await assertFails(
      updateDoc(raw(ctx, eventId), { createdAt: Timestamp.fromDate(new Date("2026-10-25T12:00:00Z")) }),
    );
  });

  it("a collection query on summaries is refused, so the document is always read by reference", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await setDoc(raw(ctx, eventId), rawSummary());
    await assertFails(getDocs(collection(ctx.db, `${USERS}/alice/raceDay/${eventId}/summaries`)));
  });
});

describe("a stored document that does not validate is reported, not shown", () => {
  it("reports an unreadable summary as invalid", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await env.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(modularDb(admin.firestore()), summaryPath("alice", eventId)), rawSummary({ schemaVersion: 2 }));
    });
    const state = await nextSummaryState(ctx, eventId, (s) => s.kind !== "none");
    expect(state).toEqual({ kind: "invalid", reason: "unsupported schemaVersion: 2" });
  });
});

describe("deleting keeps data consistent", () => {
  it("deleting an event deletes its summary and leaves another event's summary", async () => {
    const ctx = alice();
    const one = await seed(ctx, "ev-one");
    const two = await seed(ctx, "ev-two");
    await createRaceSummary(ctx, one.eventId, { coachNote: "one" });
    await createRaceSummary(ctx, two.eventId, { coachNote: "two" });

    await assertSucceeds(deleteRaceEvent(ctx, one.eventId));

    expect(await exists(ctx, one.eventId)).toBe(false);
    expect((await summaryOf(ctx, two.eventId)).coachNote).toBe("two");
  });

  it("deleting an event that has no summary works", async () => {
    const ctx = alice();
    const { eventId } = await seed(ctx);
    await assertSucceeds(deleteRaceEvent(ctx, eventId));
    expect((await getDoc(doc(ctx.db, `${USERS}/alice/raceDay/${eventId}`))).exists()).toBe(false);
  });

  it("deleting a race or an athlete leaves the event's note alone", async () => {
    const ctx = alice();
    const { eventId, me, race } = await seed(ctx);
    await createRaceSummary(ctx, eventId, { coachNote: "keep" });
    await deleteRace(ctx, eventId, race);
    await deleteRosterEntry(ctx, eventId, me);
    expect((await summaryOf(ctx, eventId)).coachNote).toBe("keep");
  });
});

describe("access: only the owner", () => {
  it("another signed-in user cannot read or write the owner's summary", async () => {
    const owner = alice();
    const { eventId } = await seed(owner);
    await createRaceSummary(owner, eventId, { coachNote: "private" });

    const mallory = asUser("mallory", "alice");
    await assertFails(createRaceSummary(mallory, eventId, { coachNote: "x" }));
    await assertFails(updateRaceSummary(mallory, eventId, { coachNote: "x" }));
    await assertFails(deleteRaceSummary(mallory, eventId));
    await expect(nextSummaryState(mallory, eventId)).rejects.toThrow(/permission-denied/);
    expect((await summaryOf(owner, eventId)).coachNote).toBe("private");
  });

  it("an unauthenticated client cannot read or write", async () => {
    const owner = alice();
    const { eventId } = await seed(owner);
    const anon: RaceDayContext = { db: modularDb(env.unauthenticatedContext().firestore()), userId: "alice" };
    await assertFails(createRaceSummary(anon, eventId, { coachNote: "x" }));
    await assertFails(deleteRaceSummary(anon, eventId));
    await expect(nextSummaryState(anon, eventId)).rejects.toThrow(/permission-denied/);
  });
});
