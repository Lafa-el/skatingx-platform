import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { RaceEntry, RaceVideoRef } from "@skatingx/schema";
import {
  doc,
  getDoc,
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
  createRaceVideo,
  createRosterEntry,
  deleteRace,
  deleteRaceEvent,
  deleteRaceVideo,
  deleteRosterEntry,
  RaceDayValidationError,
  subscribeToRaceVideos,
  subscribeToRaces,
  updateRace,
  updateRaceVideo,
  type RaceDayContext,
  type RaceDayList,
  type RaceDayListError,
} from "../../packages/firebase-client/src/firestore/race-day";
import { createRulesEnv, USERS } from "./helpers";

// REAL repository code against the emulator with the REAL firestore.rules (see
// race-day-repository.rules.test.ts). Video records are metadata only: no file, no analysis. Fixtures are obviously fake.

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

const videosOf = (ctx: RaceDayContext, eventId: string, ready?: (l: RaceDayList<RaceVideoRef>) => boolean) =>
  waitForList<RaceVideoRef>((d, e) => subscribeToRaceVideos(ctx, eventId, d, e), ready);
const racesOf = (ctx: RaceDayContext, eventId: string) =>
  waitForList<RaceEntry>((d, e) => subscribeToRaces(ctx, eventId, d, e));
const videoIds = async (ctx: RaceDayContext, eventId: string) =>
  (await videosOf(ctx, eventId)).items.map((v) => v.videoId).sort();

const videoPath = (uid: string, eventId: string, id: string) => `${USERS}/${uid}/raceDay/${eventId}/videos/${id}`;

const clip = (over = {}) => ({
  label: "500m final",
  externalUrl: "https://example.com/watch?v=abc",
  storedWhere: "Phone camera roll",
  note: "second corner",
  ...over,
});

/** A stored video as the rules require it, for tests that bypass the repository. */
const rawVideo = (videoId: string, over: Record<string, unknown> = {}) => {
  const now = Timestamp.fromDate(new Date("2026-10-24T12:00:00Z"));
  return {
    videoId,
    raceId: "race-1",
    rosterId: "sk-a",
    label: "Clip",
    externalUrl: null,
    storedWhere: null,
    note: null,
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

describe("video records written by the repository are accepted by the real rules", () => {
  it("creates a record and reads it back, with no provenance and no file fields", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);

    const id = await assertSucceeds(createRaceVideo(ctx, eventId, r1, a, clip(), { videoId: "clip-1" }));
    expect(id).toBe("clip-1");

    const list = await videosOf(ctx, eventId);
    expect(list.invalid).toEqual([]);
    expect(list.items[0]).toMatchObject({
      videoId: "clip-1",
      raceId: "race-1",
      rosterId: "sk-a",
      label: "500m final",
      externalUrl: "https://example.com/watch?v=abc",
      storedWhere: "Phone camera roll",
      note: "second corner",
    });

    const snap = await getDoc(doc(ctx.db, videoPath("alice", eventId, "clip-1")));
    expect(Object.keys(snap.data() ?? {}).sort()).toEqual(
      [
        "createdAt",
        "externalUrl",
        "label",
        "note",
        "raceId",
        "rosterId",
        "schemaVersion",
        "storedWhere",
        "updatedAt",
        "videoId",
      ].sort(),
    );
  });

  it("needs only a label: link, location and note are stored as null", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    await assertSucceeds(
      createRaceVideo(ctx, eventId, r1, a, { label: "Just a label", externalUrl: null, storedWhere: null, note: null }),
    );
    expect((await videosOf(ctx, eventId)).items[0]).toMatchObject({
      externalUrl: null,
      storedWhere: null,
      note: null,
    });
  });

  it("allows several records for one race and athlete, with generated valid ids", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const first = await createRaceVideo(ctx, eventId, r1, a, clip({ label: "Start" }));
    const second = await createRaceVideo(ctx, eventId, r1, a, clip({ label: "起跑 Start" }));
    expect(first).not.toBe(second);
    expect(await videoIds(ctx, eventId)).toHaveLength(2);
  });

  it("an existing id cannot be silently overwritten by a second create", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    await createRaceVideo(ctx, eventId, r1, a, clip(), { videoId: "clip-1" });
    await assertFails(createRaceVideo(ctx, eventId, r1, a, clip({ label: "Other" }), { videoId: "clip-1" }));
    expect((await videosOf(ctx, eventId)).items[0]?.label).toBe("500m final");
  });
});

describe("edit and delete", () => {
  it("update changes the editable fields, keeps createdAt, race and athlete, and advances updatedAt", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const id = await createRaceVideo(ctx, eventId, r1, a, clip());
    const before = (await videosOf(ctx, eventId)).items[0];

    await assertSucceeds(
      updateRaceVideo(ctx, eventId, id, { label: "Renamed", externalUrl: null, storedWhere: "Coach drive", note: null }),
    );

    const after = (await videosOf(ctx, eventId, (l) => l.items[0]?.label === "Renamed")).items[0];
    expect(after).toMatchObject({
      label: "Renamed",
      externalUrl: null,
      storedWhere: "Coach drive",
      note: null,
      raceId: "race-1",
      rosterId: "sk-a",
    });
    expect(after?.createdAt).toBe(before?.createdAt);
    expect(Date.parse(after?.updatedAt ?? "")).toBeGreaterThanOrEqual(Date.parse(before?.updatedAt ?? ""));
  });

  it("deletes one record and leaves the others", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const first = await createRaceVideo(ctx, eventId, r1, a, clip(), { videoId: "clip-1" });
    await createRaceVideo(ctx, eventId, r1, a, clip({ label: "Other" }), { videoId: "clip-2" });
    await assertSucceeds(deleteRaceVideo(ctx, eventId, first));
    expect(await videoIds(ctx, eventId)).toEqual(["clip-2"]);
  });
});

describe("validation happens before any write", () => {
  it.each([
    ["a missing label", clip({ label: "  " }), "label:required"],
    ["a javascript: link", clip({ externalUrl: "javascript:alert(1)" }), "externalUrl:urlInvalid"],
    ["a link without a scheme", clip({ externalUrl: "example.com/clip" }), "externalUrl:urlInvalid"],
    ["a link with a password", clip({ externalUrl: "https://me:pw@example.com" }), "externalUrl:urlHasCredentials"],
    ["a too long note", clip({ note: "n".repeat(1001) }), "note:tooLong"],
  ])("rejects %s with a field error and writes nothing", async (_name, input, expected) => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const error = await createRaceVideo(ctx, eventId, r1, a, input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RaceDayValidationError);
    expect((error as RaceDayValidationError).errors.map((e) => `${e.field}:${e.code}`)).toContain(expected);
    expect(await videoIds(ctx, eventId)).toEqual([]);
  });

  it("rejects invalid ids", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    await expect(createRaceVideo(ctx, "Bad/Event", r1, a, clip())).rejects.toBeInstanceOf(RaceDayValidationError);
    await expect(createRaceVideo(ctx, eventId, "Bad_Race", a, clip())).rejects.toBeInstanceOf(RaceDayValidationError);
    await expect(createRaceVideo(ctx, eventId, r1, a, clip(), { videoId: "Bad_ID" })).rejects.toBeInstanceOf(
      RaceDayValidationError,
    );
    await expect(updateRaceVideo(ctx, eventId, "Bad_ID", clip())).rejects.toBeInstanceOf(RaceDayValidationError);
    await expect(deleteRaceVideo(ctx, eventId, "../x")).rejects.toBeInstanceOf(RaceDayValidationError);
  });
});

describe("the rules keep video records to metadata", () => {
  const writeRaw = (ctx: RaceDayContext, id: string, over = {}) =>
    setDoc(doc(ctx.db, videoPath("alice", "ev", id)), rawVideo(id, over));

  it("accepts a plain record", async () => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    await assertSucceeds(writeRaw(ctx, "clip-1"));
  });

  it.each([
    ["a file or media field", { fileUrl: "gs://bucket/clip.mp4" }],
    ["a size field", { sizeBytes: 12345 }],
    ["a verification field", { verification: "pending" }],
    ["an empty label", { label: "" }],
    ["a label over 120 characters", { label: "l".repeat(121) }],
    ["a javascript: link", { externalUrl: "javascript:alert(1)" }],
    ["a link without a scheme", { externalUrl: "example.com/clip" }],
    ["a link over 2048 characters", { externalUrl: "https://example.com/" + "a".repeat(2048) }],
    ["a location over 200 characters", { storedWhere: "s".repeat(201) }],
    ["a note over 1000 characters", { note: "n".repeat(1001) }],
    ["a video id that does not match the document id", { videoId: "other" }],
    ["a non-slug race id", { raceId: "Bad_Race" }],
  ])("refuses %s", async (_name, over) => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    await assertFails(writeRaw(ctx, "clip-1", over));
  });

  it("refuses a record with a missing key", async () => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    const { note: _note, ...withoutNote } = rawVideo("clip-1");
    await assertFails(setDoc(doc(ctx.db, videoPath("alice", "ev", "clip-1")), withoutNote));
  });

  it("refuses an update that changes createdAt", async () => {
    const ctx = alice();
    const { eventId, a, r1 } = await seed(ctx);
    const id = await createRaceVideo(ctx, eventId, r1, a, clip());
    await assertFails(updateDoc(doc(ctx.db, videoPath("alice", eventId, id)), { createdAt: Timestamp.now() }));
  });

  it("does not check for credentials in a link (rules only check the scheme), so the codec hides such a record", async () => {
    const ctx = alice();
    await createRaceEvent(ctx, eventInput, { eventId: "ev" });
    await assertSucceeds(writeRaw(ctx, "clip-1", { externalUrl: "https://me:pw@example.com/clip" }));
    await assertSucceeds(writeRaw(ctx, "clip-2"));

    const list = await videosOf(ctx, "ev", (l) => l.items.length + l.invalid.length === 2);
    expect(list.items.map((v) => v.videoId)).toEqual(["clip-2"]);
    expect(list.invalid).toEqual([{ id: "clip-1", reason: "externalUrl is not a plain http(s) link" }]);
  });
});

describe("deleting keeps data consistent", () => {
  async function addClips(ctx: RaceDayContext, s: Awaited<ReturnType<typeof seed>>) {
    for (const raceId of [s.r1, s.r2]) {
      for (const rosterId of [s.a, s.b]) {
        await createRaceVideo(ctx, s.eventId, raceId, rosterId, clip(), { videoId: `${raceId}-${rosterId}` });
      }
    }
  }

  it("deleting a race deletes only that race's video records", async () => {
    const ctx = alice();
    const s = await seed(ctx);
    await addClips(ctx, s);
    await assertSucceeds(deleteRace(ctx, s.eventId, s.r1));
    expect(await videoIds(ctx, s.eventId)).toEqual(["race-2-sk-a", "race-2-sk-b"]);
    expect((await racesOf(ctx, s.eventId)).items.map((r) => r.raceId)).toEqual([s.r2]);
  });

  it("deleting an athlete deletes only their video records", async () => {
    const ctx = alice();
    const s = await seed(ctx);
    await addClips(ctx, s);
    await assertSucceeds(deleteRosterEntry(ctx, s.eventId, s.a));
    expect(await videoIds(ctx, s.eventId)).toEqual(["race-1-sk-b", "race-2-sk-b"]);
  });

  it("deleting an event deletes its video records and leaves other events' records", async () => {
    const ctx = alice();
    const drop = await seed(ctx, "drop");
    const keep = await seed(ctx, "keep");
    await createRaceVideo(ctx, drop.eventId, drop.r1, drop.a, clip(), { videoId: "drop-clip" });
    await createRaceVideo(ctx, keep.eventId, keep.r1, keep.a, clip(), { videoId: "keep-clip" });

    await assertSucceeds(deleteRaceEvent(ctx, drop.eventId));

    expect(await videoIds(ctx, "drop")).toEqual([]);
    expect(await videoIds(ctx, "keep")).toEqual(["keep-clip"]);
  });

  it("taking an athlete off a race's list keeps their video records", async () => {
    const ctx = alice();
    const s = await seed(ctx);
    await createRaceVideo(ctx, s.eventId, s.r1, s.a, clip(), { videoId: "clip-1" });
    await updateRace(ctx, s.eventId, s.r1, raceInput({ label: "One", rosterIds: [s.b] }));
    expect(await videoIds(ctx, s.eventId)).toEqual(["clip-1"]);
  });
});

describe("access: only the owner", () => {
  it("another signed-in user cannot read or write the owner's video records", async () => {
    const owner = alice();
    const { eventId, a, r1 } = await seed(owner);
    const id = await createRaceVideo(owner, eventId, r1, a, clip());
    const mallory = asUser("mallory", "alice");

    await assertFails(getDoc(doc(mallory.db, videoPath("alice", eventId, id))));
    await assertFails(createRaceVideo(mallory, eventId, r1, a, clip({ label: "Mine" })));
    await assertFails(updateRaceVideo(mallory, eventId, id, clip({ label: "Hijack" })));
    await assertFails(deleteRaceVideo(mallory, eventId, id));
    await expect(
      waitForList<RaceVideoRef>((d, e) => subscribeToRaceVideos(mallory, eventId, d, e)),
    ).rejects.toThrow(/permission-denied/);
    expect((await videosOf(owner, eventId)).items[0]?.label).toBe("500m final");
  });

  it("an unauthenticated client cannot read or write", async () => {
    const owner = alice();
    const { eventId, a, r1 } = await seed(owner);
    const anon: RaceDayContext = { db: modularDb(env.unauthenticatedContext().firestore()), userId: "alice" };
    await assertFails(createRaceVideo(anon, eventId, r1, a, clip()));
    await expect(
      waitForList<RaceVideoRef>((d, e) => subscribeToRaceVideos(anon, eventId, d, e)),
    ).rejects.toThrow(/permission-denied/);
  });
});
