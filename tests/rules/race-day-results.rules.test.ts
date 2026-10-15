import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { RaceEntry, RaceResult } from "@skatingx/schema";
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createRace,
  createRaceEvent,
  createRaceResult,
  createRosterEntry,
  deleteRace,
  deleteRaceEvent,
  deleteRaceResult,
  deleteRosterEntry,
  RaceDayValidationError,
  setRaceResultVerified,
  subscribeToRaceResults,
  subscribeToRaces,
  updateRace,
  updateRaceResult,
  type RaceDayContext,
  type RaceDayList,
  type RaceDayListError,
} from "../../packages/firebase-client/src/firestore/race-day";
import { createRulesEnv, USERS } from "./helpers";

// REAL repository code against the emulator with the REAL firestore.rules (see
// race-day-repository.rules.test.ts). Fixtures are obviously fake.

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
  isSelf: false,
  isFollowed: true,
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
const finished = (over = {}) => ({
  status: "finished",
  time: "0:49.123",
  place: "2",
  advanced: true,
  sourceNote: "",
  ...over,
});
const didNotStart = { status: "DNS", time: "", place: "", advanced: null, sourceNote: "" };

function waitForList<T>(
  subscribe: (
    onData: (list: RaceDayList<T>) => void,
    onError: (error: RaceDayListError) => void,
  ) => Unsubscribe,
  ready: (list: RaceDayList<T>) => boolean = () => true,
): Promise<RaceDayList<T>> {
  return new Promise((resolve, reject) => {
    let stop: Unsubscribe = () => undefined;
    const timer = setTimeout(() => {
      stop();
      reject(new Error("timed out waiting for the expected snapshot"));
    }, 8000);
    stop = subscribe(
      (list) => {
        if (ready(list)) {
          clearTimeout(timer);
          stop();
          resolve(list);
        }
      },
      (error) => {
        clearTimeout(timer);
        stop();
        reject(new Error(`${error.code}: ${error.message}`));
      },
    );
  });
}

const resultsOf = (ctx: RaceDayContext, eventId: string, ready?: (l: RaceDayList<RaceResult>) => boolean) =>
  waitForList<RaceResult>((d, e) => subscribeToRaceResults(ctx, eventId, d, e), ready);
const racesOf = (ctx: RaceDayContext, eventId: string) =>
  waitForList<RaceEntry>((d, e) => subscribeToRaces(ctx, eventId, d, e));
const resultIds = async (ctx: RaceDayContext, eventId: string) =>
  (await resultsOf(ctx, eventId)).items.map((r) => r.resultId).sort();

const resultPath = (uid: string, eventId: string, id: string) =>
  `${USERS}/${uid}/raceDay/${eventId}/results/${id}`;

/** A stored result as the rules require it, for tests that bypass the repository. */
const rawResult = (raceId: string, rosterId: string, over: Record<string, unknown> = {}) => {
  const now = Timestamp.fromDate(new Date("2026-10-24T12:00:00Z"));
  return {
    resultId: `${raceId}_${rosterId}`,
    raceId,
    rosterId,
    status: "finished",
    timeSeconds: 49.123,
    place: 2,
    advanced: null,
    verification: "pending",
    source: "manual",
    sourceNote: "",
    verifiedAt: null,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
};

/** An event with two athletes and two races, each athlete entered in both. */
async function seed(ctx: RaceDayContext, eventId = "ev") {
  await createRaceEvent(ctx, eventInput, { eventId });
  const a = await createRosterEntry(ctx, eventId, rosterInput({ displayName: "Skater A" }), { rosterId: "sk-a" });
  const b = await createRosterEntry(ctx, eventId, rosterInput({ displayName: "Skater B" }), { rosterId: "sk-b" });
  const r1 = await createRace(ctx, eventId, raceInput({ label: "One", rosterIds: [a, b] }), { raceId: "race-1" });
  const r2 = await createRace(ctx, eventId, raceInput({ label: "Two", sortOrder: 2, rosterIds: [a, b] }), {
    raceId: "race-2",
  });
  return { eventId, a, b, r1, r2 };
}

describe("results written by the repository are accepted by the real rules", () => {
  it("creates a pending result with the deterministic id and keeps three decimals exactly", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);

    const id = await assertSucceeds(createRaceResult(ctx, eventId, r1, a, finished()));
    expect(id).toBe("race-1_sk-a");

    const list = await resultsOf(ctx, eventId);
    expect(list.invalid).toEqual([]);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      resultId: "race-1_sk-a",
      raceId: "race-1",
      rosterId: "sk-a",
      status: "finished",
      timeSeconds: 49.123,
      place: 2,
      advanced: true,
      verification: "pending",
      verifiedAt: null,
      source: "manual",
    });
  });

  it.each([
    ["DNS", didNotStart],
    ["DNF", { ...didNotStart, status: "DNF" }],
    ["DQ", { ...didNotStart, status: "DQ", advanced: false }],
  ])("accepts %s with no time, place or advancement", async (status, input) => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    await assertSucceeds(createRaceResult(ctx, eventId, r1, a, input));
    expect((await resultsOf(ctx, eventId)).items[0]).toMatchObject({
      status,
      timeSeconds: null,
      place: null,
    });
  });

  it("a finished result may leave place and advancement unknown", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    await assertSucceeds(createRaceResult(ctx, eventId, r1, a, finished({ place: "", advanced: null })));
    expect((await resultsOf(ctx, eventId)).items[0]).toMatchObject({ place: null, advanced: null });
  });

  it("stores exactly the keys the rules allow", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    await createRaceResult(ctx, eventId, r1, a, finished());
    const snap = await getDoc(doc(ctx.db, resultPath("alice", eventId, "race-1_sk-a")));
    expect(Object.keys(snap.data() ?? {}).sort()).toEqual(
      [
        "advanced",
        "createdAt",
        "place",
        "raceId",
        "resultId",
        "rosterId",
        "schemaVersion",
        "source",
        "sourceNote",
        "status",
        "timeSeconds",
        "updatedAt",
        "verification",
        "verifiedAt",
      ].sort(),
    );
  });
});

describe("edit, verify and delete", () => {
  it("update keeps createdAt, advances updatedAt, and returns a verified result to pending", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const id = await createRaceResult(ctx, eventId, r1, a, finished());
    await setRaceResultVerified(ctx, eventId, id, true);
    const verified = (await resultsOf(ctx, eventId, (l) => l.items[0]?.verification === "verified")).items[0];
    expect(verified?.verifiedAt).not.toBeNull();

    await assertSucceeds(updateRaceResult(ctx, eventId, id, finished({ time: "49.5", place: "1" })));

    const after = (await resultsOf(ctx, eventId, (l) => l.items[0]?.verification === "pending")).items[0];
    expect(after).toMatchObject({ timeSeconds: 49.5, place: 1, verification: "pending", verifiedAt: null });
    expect(after?.createdAt).toBe(verified?.createdAt);
    expect(Date.parse(after?.updatedAt ?? "")).toBeGreaterThanOrEqual(Date.parse(verified?.updatedAt ?? ""));
  });

  it("can change a finished result to DNF, which clears time and place", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const id = await createRaceResult(ctx, eventId, r1, a, finished());
    await assertSucceeds(updateRaceResult(ctx, eventId, id, { ...didNotStart, status: "DNF" }));
    expect((await resultsOf(ctx, eventId)).items[0]).toMatchObject({
      status: "DNF",
      timeSeconds: null,
      place: null,
      advanced: null,
    });
  });

  it("verifies and un-verifies", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const id = await createRaceResult(ctx, eventId, r1, a, finished());
    await setRaceResultVerified(ctx, eventId, id, true);
    expect((await resultsOf(ctx, eventId, (l) => l.items[0]?.verification === "verified")).items).toHaveLength(1);
    await setRaceResultVerified(ctx, eventId, id, false);
    expect((await resultsOf(ctx, eventId, (l) => l.items[0]?.verification === "pending")).items[0]?.verifiedAt).toBeNull();
  });

  it("an existing result cannot be silently overwritten by a second create", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    await createRaceResult(ctx, eventId, r1, a, finished());
    await assertFails(createRaceResult(ctx, eventId, r1, a, finished({ time: "40.000" })));
    expect((await resultsOf(ctx, eventId)).items[0]?.timeSeconds).toBe(49.123);
  });

  it("deletes one result and leaves the others", async () => {
    const ctx = alice();
    const { eventId, a, b, r1 } = await seed(ctx);
    const first = await createRaceResult(ctx, eventId, r1, a, finished());
    await createRaceResult(ctx, eventId, r1, b, finished({ time: "50.1" }));
    await assertSucceeds(deleteRaceResult(ctx, eventId, first));
    expect(await resultIds(ctx, eventId)).toEqual(["race-1_sk-b"]);
  });
});

describe("validation happens before any write", () => {
  it.each([
    ["a finished race without a time", finished({ time: "" }), "time:timeRequired"],
    ["seconds of 60 or more after a minute", finished({ time: "1:75.00" }), "time:timeInvalid"],
    ["four decimals", finished({ time: "49.1234" }), "time:timeDecimals"],
    ["a time over 30 minutes", finished({ time: "30:00.001" }), "time:timeInvalid"],
    ["a time on a DNS", { ...didNotStart, time: "49.8" }, "time:timeNotAllowed"],
    ["a place on a DNF", { ...didNotStart, status: "DNF", place: "3" }, "place:placeNotAllowed"],
    ["advancement on a DQ", { ...didNotStart, status: "DQ", advanced: true }, "advanced:advancedNotAllowed"],
  ])("rejects %s with a field error and writes nothing", async (_name, input, expected) => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const error = await createRaceResult(ctx, eventId, r1, a, input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RaceDayValidationError);
    expect((error as RaceDayValidationError).errors.map((e) => `${e.field}:${e.code}`)).toContain(expected);
    expect(await resultIds(ctx, eventId)).toEqual([]);
  });

  it("rejects invalid ids and malformed result ids", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    await expect(createRaceResult(ctx, "Bad/Event", r1, a, finished())).rejects.toBeInstanceOf(RaceDayValidationError);
    await expect(createRaceResult(ctx, eventId, "Bad_Race", a, finished())).rejects.toBeInstanceOf(
      RaceDayValidationError,
    );
    await expect(updateRaceResult(ctx, eventId, "no-underscore", finished())).rejects.toBeInstanceOf(
      RaceDayValidationError,
    );
    await expect(deleteRaceResult(ctx, eventId, "a_b_c")).rejects.toBeInstanceOf(RaceDayValidationError);
  });
});

describe("the rules refuse what the repository would never write", () => {
  const writeRaw = (ctx: RaceDayContext, eventId: string, raceId: string, rosterId: string, over = {}) =>
    setDoc(doc(ctx.db, resultPath("alice", eventId, `${raceId}_${rosterId}`)), rawResult(raceId, rosterId, over));

  it.each([
    ["finished without a time", { timeSeconds: null }],
    ["a time of zero", { timeSeconds: 0 }],
    ["a time over 1800 seconds", { timeSeconds: 1800.001 }],
    ["a place of zero", { place: 0 }],
    ["a fractional place", { place: 1.5 }],
    ["a DNS with a time", { status: "DNS", timeSeconds: 50, place: null }],
    ["a DNF with a place", { status: "DNF", timeSeconds: null, place: 2 }],
    ["a DQ that advanced", { status: "DQ", timeSeconds: null, place: null, advanced: true }],
    ["an unknown status", { status: "won" }],
    ["a result id that does not match raceId and rosterId", { resultId: "other_sk-a" }],
    ["an extra field", { note: "x" }],
  ])("refuses %s", async (_name, over) => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    await assertFails(writeRaw(ctx, "ev", "race-1", "sk-a", over));
  });

  it("refuses an update that changes createdAt", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const id = await createRaceResult(ctx, eventId, r1, a, finished());
    await assertFails(updateDoc(doc(ctx.db, resultPath("alice", eventId, id)), { createdAt: Timestamp.now() }));
  });

  it("does not check decimal places (rules cannot), which is why the codec hides such a result on read", async () => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    await env.withSecurityRulesDisabled(async (admin) => {
      await setDoc(
        doc(admin.firestore(), resultPath("alice", "ev", "race-1_sk-a")),
        rawResult("race-1", "sk-a", { timeSeconds: 49.1234 }),
      );
      await setDoc(doc(admin.firestore(), resultPath("alice", "ev", "race-1_sk-b")), rawResult("race-1", "sk-b"));
    });
    await assertSucceeds(writeRaw(ctx, "ev", "race-2", "sk-a", { timeSeconds: 49.1234 }));

    const list = await resultsOf(ctx, "ev", (l) => l.items.length + l.invalid.length === 3);
    expect(list.items.map((r) => r.resultId)).toEqual(["race-1_sk-b"]);
    expect(list.invalid.map((i) => i.id).sort()).toEqual(["race-1_sk-a", "race-2_sk-a"]);
    expect(list.invalid[0]?.reason).toBe("time has more than three decimals");
  });
});

describe("deleting keeps data consistent", () => {
  it("deleting a race deletes only that race's results", async () => {
    const ctx = alice();
    const { eventId, a, b, r1, r2 } = await seed(ctx);
    for (const raceId of [r1, r2]) {
      await createRaceResult(ctx, eventId, raceId, a, finished());
      await createRaceResult(ctx, eventId, raceId, b, finished({ time: "50.1" }));
    }

    await assertSucceeds(deleteRace(ctx, eventId, r1));

    expect(await resultIds(ctx, eventId)).toEqual(["race-2_sk-a", "race-2_sk-b"]);
    expect((await racesOf(ctx, eventId)).items.map((r) => r.raceId)).toEqual([r2]);
  });

  it("deleting an athlete deletes their results, removes them from races, and leaves others alone", async () => {
    const ctx = alice();
    const { eventId, a, b, r1, r2 } = await seed(ctx);
    for (const raceId of [r1, r2]) {
      await createRaceResult(ctx, eventId, raceId, a, finished());
      await createRaceResult(ctx, eventId, raceId, b, finished({ time: "50.1" }));
    }

    await assertSucceeds(deleteRosterEntry(ctx, eventId, a));

    expect(await resultIds(ctx, eventId)).toEqual(["race-1_sk-b", "race-2_sk-b"]);
    const races = (await racesOf(ctx, eventId)).items;
    expect(races.map((r) => r.rosterIds)).toEqual([[b], [b]]);
  });

  it("deleting an event deletes all of its results and leaves other events' results", async () => {
    const ctx = alice();
    const drop = await seed(ctx, "drop");
    const keep = await seed(ctx, "keep");
    await createRaceResult(ctx, drop.eventId, drop.r1, drop.a, finished());
    await createRaceResult(ctx, drop.eventId, drop.r2, drop.b, finished());
    await createRaceResult(ctx, keep.eventId, keep.r1, keep.a, finished());

    await assertSucceeds(deleteRaceEvent(ctx, drop.eventId));

    expect(await resultIds(ctx, "drop")).toEqual([]);
    expect(await resultIds(ctx, "keep")).toEqual(["race-1_sk-a"]);
  });

  it("a race with hundreds of results is fully deleted (the emulator no longer enforces a batch cap, so this does not prove chunking)", async () => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    await createRace(ctx, "ev", raceInput({ label: "Big" }), { raceId: "race-1" });
    await createRace(ctx, "ev", raceInput({ label: "Other", sortOrder: 2 }), { raceId: "race-2" });
    const total = 460;
    await env.withSecurityRulesDisabled(async (admin) => {
      const db = modularDb(admin.firestore());
      for (let start = 0; start < total; start += 200) {
        const batch = writeBatch(db);
        for (let i = start; i < Math.min(start + 200, total); i += 1) {
          batch.set(doc(db, resultPath("alice", "ev", `race-1_sk-${String(i)}`)), rawResult("race-1", `sk-${String(i)}`));
        }
        await batch.commit();
      }
      await setDoc(doc(db, resultPath("alice", "ev", "race-2_sk-0")), rawResult("race-2", "sk-0"));
    });

    await assertSucceeds(deleteRace(ctx, "ev", "race-1"));

    expect(await resultIds(ctx, "ev")).toEqual(["race-2_sk-0"]);
    expect((await racesOf(ctx, "ev")).items.map((r) => r.raceId)).toEqual(["race-2"]);
  });
});

describe("an athlete removed from a race keeps their result (nothing is silently lost)", () => {
  it("editing the race roster does not touch results", async () => {
    const ctx = alice();
    const { eventId, a, b, r1 } = await seed(ctx);
    await createRaceResult(ctx, eventId, r1, a, finished());

    await updateRace(ctx, eventId, r1, raceInput({ label: "One", rosterIds: [b] }));

    const list = await resultsOf(ctx, eventId);
    expect(list.items.map((r) => r.resultId)).toEqual(["race-1_sk-a"]);
    const race = (await racesOf(ctx, eventId)).items.find((r) => r.raceId === r1);
    expect(race?.rosterIds).toEqual([b]);
  });
});

describe("access: only the owner", () => {
  it("another signed-in user cannot read or write the owner's results", async () => {
    const owner = alice();
    const { eventId, a, r1 } = await seed(owner);
    const id = await createRaceResult(owner, eventId, r1, a, finished());
    const mallory = asUser("mallory", "alice");

    await assertFails(getDoc(doc(mallory.db, resultPath("alice", eventId, id))));
    await assertFails(createRaceResult(mallory, eventId, r1, "sk-b", finished()));
    await assertFails(updateRaceResult(mallory, eventId, id, finished({ time: "40" })));
    await assertFails(setRaceResultVerified(mallory, eventId, id, true));
    await assertFails(deleteRaceResult(mallory, eventId, id));
    await expect(
      waitForList<RaceResult>((d, e) => subscribeToRaceResults(mallory, eventId, d, e)),
    ).rejects.toThrow(/permission-denied/);
    expect((await resultsOf(owner, eventId)).items[0]).toMatchObject({ timeSeconds: 49.123, verification: "pending" });
  });

  it("an unauthenticated client cannot read or write", async () => {
    const owner = alice();
    const { eventId, a, r1 } = await seed(owner);
    const anon: RaceDayContext = { db: modularDb(env.unauthenticatedContext().firestore()), userId: "alice" };
    await assertFails(createRaceResult(anon, eventId, r1, a, finished()));
    await expect(
      waitForList<RaceResult>((d, e) => subscribeToRaceResults(anon, eventId, d, e)),
    ).rejects.toThrow(/permission-denied/);
  });
});
