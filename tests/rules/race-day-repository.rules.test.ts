import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { RaceEntry, RaceEvent, RaceRosterEntry } from "@skatingx/schema";
import { doc, getDoc, setDoc, Timestamp, type Firestore, type Unsubscribe } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createRace,
  createRaceEvent,
  createRosterEntry,
  deleteRace,
  deleteRaceEvent,
  deleteRosterEntry,
  RaceDayValidationError,
  setRaceEventVerified,
  setRaceVerified,
  setRosterEntryVerified,
  subscribeToRaceEvents,
  subscribeToRaces,
  subscribeToRoster,
  updateRace,
  updateRaceEvent,
  updateRosterEntry,
  type RaceDayContext,
  type RaceDayList,
  type RaceDayListError,
} from "../../packages/firebase-client/src/firestore/race-day";
import { createRulesEnv, USERS } from "./helpers";

// These run the REAL repository code against the emulator with the REAL firestore.rules.
// They prove the two agree: everything the repository writes is accepted by the rules,
// and what the rules must refuse stays refused. Fixtures are obviously fake.

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

// The test helper declares the compat `Firestore` type, but at runtime it returns the modular
// instance that `firebase/firestore` functions (and the repository) take. One cast, here.
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

/** Resolves with the first list that satisfies `ready`; rejects on a listener error or timeout. */
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

const events = (ctx: RaceDayContext, ready?: (l: RaceDayList<RaceEvent>) => boolean) =>
  waitForList<RaceEvent>((d, e) => subscribeToRaceEvents(ctx, d, e), ready);
const rosterOf = (ctx: RaceDayContext, eventId: string) =>
  waitForList<RaceRosterEntry>((d, e) => subscribeToRoster(ctx, eventId, d, e));
const racesOf = (ctx: RaceDayContext, eventId: string) =>
  waitForList<RaceEntry>((d, e) => subscribeToRaces(ctx, eventId, d, e));

describe("writes made by the repository are accepted by the real rules", () => {
  it("creates an event, a roster entry and a race, all pending, and reads them back", async () => {
    const ctx = alice();
    const eventId = await assertSucceeds(createRaceEvent(ctx, eventInput, { eventId: "test-event" }));
    const rosterId = await assertSucceeds(
      createRosterEntry(ctx, eventId, rosterInput({ isSelf: true, athleteRefId: "test-athlete" })),
    );
    const raceId = await assertSucceeds(
      createRace(ctx, eventId, raceInput({ scheduledAt: "2026-10-24T09:30:00-04:00", rosterIds: [rosterId] })),
    );

    const evList = await events(ctx, (l) => l.items.length === 1);
    expect(evList.invalid).toEqual([]);
    expect(evList.items[0]).toMatchObject({
      eventId: "test-event",
      verification: "pending",
      verifiedAt: null,
      schemaVersion: 1,
      dates: ["2026-10-24", "2026-10-25"],
    });

    const roster = await rosterOf(ctx, eventId);
    expect(roster.items).toHaveLength(1);
    expect(roster.items[0]).toMatchObject({ rosterId, isSelf: true, athleteRefId: "test-athlete", verification: "pending" });

    const races = await racesOf(ctx, eventId);
    expect(races.items[0]).toMatchObject({
      raceId,
      rosterIds: [rosterId],
      scheduledAt: "2026-10-24T13:30:00.000Z",
      verification: "pending",
    });
  });

  it("generates valid ids when none is given, including for non-ASCII names", async () => {
    const ctx = alice();
    const eventId = await assertSucceeds(createRaceEvent(ctx, eventInput));
    const rosterId = await assertSucceeds(createRosterEntry(ctx, eventId, rosterInput({ displayName: "测试选手" })));
    expect(eventId).toMatch(/^test-championships-[a-z0-9]{6}$/);
    expect(rosterId).toMatch(/^item-[a-z0-9]{6}$/);
  });

  it("stores unknown optional values as explicit null and accepts a race with no time", async () => {
    const ctx = alice();
    const eventId = await createRaceEvent(ctx, { ...eventInput, timeZone: null }, { eventId: "ev" });
    await assertSucceeds(createRace(ctx, eventId, raceInput({ day: null, scheduledAt: null })));
    const races = await racesOf(ctx, eventId);
    expect(races.items[0]).toMatchObject({ day: null, scheduledAt: null, round: null, heat: null });
  });
});

describe("edits and verification", () => {
  it("update keeps createdAt, advances updatedAt, and returns verified data to pending", async () => {
    const ctx = alice();
    const eventId = await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    await assertSucceeds(setRaceEventVerified(ctx, eventId, true));

    const verified = (await events(ctx, (l) => l.items[0]?.verification === "verified")).items[0];
    expect(verified?.verifiedAt).not.toBeNull();

    await assertSucceeds(updateRaceEvent(ctx, eventId, { ...eventInput, name: "Renamed" }));
    const edited = (await events(ctx, (l) => l.items[0]?.name === "Renamed")).items[0];
    expect(edited).toMatchObject({ verification: "pending", verifiedAt: null, name: "Renamed" });
    expect(edited?.createdAt).toBe(verified?.createdAt);
    expect(Date.parse(edited?.updatedAt ?? "")).toBeGreaterThanOrEqual(Date.parse(verified?.updatedAt ?? ""));
  });

  it("verifies and un-verifies roster entries and races", async () => {
    const ctx = alice();
    const eventId = await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    const rosterId = await createRosterEntry(ctx, eventId, rosterInput());
    const raceId = await createRace(ctx, eventId, raceInput());

    await assertSucceeds(setRosterEntryVerified(ctx, eventId, rosterId, true));
    await assertSucceeds(setRaceVerified(ctx, eventId, raceId, true));
    expect((await rosterOf(ctx, eventId)).items[0]?.verification).toBe("verified");
    expect((await racesOf(ctx, eventId)).items[0]?.verification).toBe("verified");

    await assertSucceeds(setRosterEntryVerified(ctx, eventId, rosterId, false));
    expect((await rosterOf(ctx, eventId)).items[0]).toMatchObject({ verification: "pending", verifiedAt: null });
  });

  it("editing a roster entry or a race also resets verification", async () => {
    const ctx = alice();
    const eventId = await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    const rosterId = await createRosterEntry(ctx, eventId, rosterInput());
    const raceId = await createRace(ctx, eventId, raceInput());
    await setRosterEntryVerified(ctx, eventId, rosterId, true);
    await setRaceVerified(ctx, eventId, raceId, true);

    await assertSucceeds(updateRosterEntry(ctx, eventId, rosterId, rosterInput({ bib: "111" })));
    await assertSucceeds(updateRace(ctx, eventId, raceId, raceInput({ label: "Edited" })));

    expect((await rosterOf(ctx, eventId)).items.find((r) => r.bib === "111")).toMatchObject({ verification: "pending" });
    expect((await racesOf(ctx, eventId)).items.find((r) => r.label === "Edited")).toMatchObject({ verification: "pending" });
  });

  it("an existing id cannot be silently overwritten by a second create", async () => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    await assertFails(createRaceEvent(ctx, { ...eventInput, name: "Overwrite attempt" }, { eventId: "ev" }));
    expect((await events(ctx, (l) => l.items.length === 1)).items[0]?.name).toBe("Test Championships");
  });
});

describe("deleting keeps data consistent", () => {
  it("deleting an athlete removes them from races but leaves other athletes and verification alone", async () => {
    const ctx = alice();
    const eventId = await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    const a = await createRosterEntry(ctx, eventId, rosterInput({ displayName: "Skater A" }));
    const b = await createRosterEntry(ctx, eventId, rosterInput({ displayName: "Skater B" }));
    const withBoth = await createRace(ctx, eventId, raceInput({ label: "Both", rosterIds: [a, b] }));
    const onlyB = await createRace(ctx, eventId, raceInput({ label: "OnlyB", rosterIds: [b], sortOrder: 2 }));
    await setRaceVerified(ctx, eventId, withBoth, true);

    await assertSucceeds(deleteRosterEntry(ctx, eventId, a));

    const roster = await rosterOf(ctx, eventId);
    expect(roster.items.map((r) => r.rosterId)).toEqual([b]);
    const races = (await racesOf(ctx, eventId)).items;
    expect(races.find((r) => r.raceId === withBoth)).toMatchObject({ rosterIds: [b], verification: "verified" });
    expect(races.find((r) => r.raceId === onlyB)?.rosterIds).toEqual([b]);
  });

  it("deleting a race removes only that race", async () => {
    const ctx = alice();
    const eventId = await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    const r1 = await createRace(ctx, eventId, raceInput({ label: "One" }));
    await createRace(ctx, eventId, raceInput({ label: "Two", sortOrder: 2 }));
    await assertSucceeds(deleteRace(ctx, eventId, r1));
    expect((await racesOf(ctx, eventId)).items.map((r) => r.label)).toEqual(["Two"]);
  });

  it("deleting an event removes its roster and races, and leaves other events untouched", async () => {
    const ctx = alice();
    const keep = await createRaceEvent(ctx, { ...eventInput, name: "Keep" }, { eventId: "keep" });
    const drop = await createRaceEvent(ctx, { ...eventInput, name: "Drop" }, { eventId: "drop" });
    await createRosterEntry(ctx, drop, rosterInput());
    await createRace(ctx, drop, raceInput());
    await createRosterEntry(ctx, keep, rosterInput());

    await assertSucceeds(deleteRaceEvent(ctx, drop));

    expect((await events(ctx)).items.map((e) => e.eventId)).toEqual(["keep"]);
    expect((await rosterOf(ctx, drop)).items).toEqual([]);
    expect((await racesOf(ctx, drop)).items).toEqual([]);
    expect((await rosterOf(ctx, keep)).items).toHaveLength(1);
  });
});

describe("validation happens before any write", () => {
  it("rejects invalid input with field errors and writes nothing", async () => {
    const ctx = alice();
    const error = await createRaceEvent(ctx, { ...eventInput, name: "  ", dates: [] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RaceDayValidationError);
    expect((error as RaceDayValidationError).errors.map((e) => `${e.field}:${e.code}`).sort()).toEqual([
      "dates:required",
      "name:required",
    ]);
    expect((await events(ctx)).items).toEqual([]);
  });

  it("rejects an invalid explicit id and invalid path ids", async () => {
    const ctx = alice();
    await expect(createRaceEvent(ctx, eventInput, { eventId: "Bad_ID" })).rejects.toBeInstanceOf(RaceDayValidationError);
    await expect(createRosterEntry(ctx, "Bad/Event", rosterInput())).rejects.toBeInstanceOf(RaceDayValidationError);
    await expect(deleteRaceEvent(ctx, "../x")).rejects.toBeInstanceOf(RaceDayValidationError);
  });
});

describe("access: only the owner", () => {
  it("another signed-in user cannot read or write the owner's data", async () => {
    const owner = alice();
    const eventId = await createRaceEvent(owner, eventInput, { eventId: "ev" });
    const bob = asUser("bob", "alice");

    await assertFails(createRaceEvent(bob, eventInput, { eventId: "ev2" }));
    await assertFails(updateRaceEvent(bob, eventId, { ...eventInput, name: "Hijack" }));
    await assertFails(setRaceEventVerified(bob, eventId, true));
    await assertFails(deleteRaceEvent(bob, eventId));
    await expect(events(bob)).rejects.toThrow(/permission-denied/);
    expect((await events(owner)).items[0]?.name).toBe("Test Championships");
  });

  it("an unauthenticated client cannot read or write", async () => {
    const anon: RaceDayContext = { db: modularDb(env.unauthenticatedContext().firestore()), userId: "alice" };
    await assertFails(createRaceEvent(anon, eventInput, { eventId: "ev" }));
    await expect(events(anon)).rejects.toThrow(/permission-denied/);
  });
});

describe("reading is defensive", () => {
  it("reports a corrupted document as invalid and still returns the good ones", async () => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "good" });
    await env.withSecurityRulesDisabled(async (admin) => {
      const now = Timestamp.fromDate(new Date("2026-10-24T12:00:00Z"));
      await setDoc(doc(admin.firestore(), `${USERS}/alice/raceDay/corrupt`), {
        eventId: "corrupt",
        name: "Corrupt",
        dates: ["2026-10-24"],
        timeZone: null,
        venue: null,
        verification: "verified", // verified without a verification time: must not display as verified
        source: "manual",
        sourceNote: "",
        verifiedAt: null,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
    });

    const list = await events(ctx, (l) => l.items.length + l.invalid.length === 2);
    expect(list.items.map((e) => e.eventId)).toEqual(["good"]);
    expect(list.invalid).toEqual([{ id: "corrupt", reason: "verified without a valid verifiedAt" }]);
  });

  it("direct reads of repository-written data match what the subscription returns", async () => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    const snap = await getDoc(doc(ctx.db, `${USERS}/alice/raceDay/ev`));
    expect(snap.exists()).toBe(true);
    expect(Object.keys(snap.data() ?? {}).sort()).toEqual(
      [
        "createdAt",
        "dates",
        "eventId",
        "name",
        "schemaVersion",
        "source",
        "sourceNote",
        "timeZone",
        "updatedAt",
        "venue",
        "verification",
        "verifiedAt",
      ].sort(),
    );
  });
});
