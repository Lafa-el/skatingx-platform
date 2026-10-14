import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { createRulesEnv, USERS } from "./helpers";

// Race Day rules (ADR-001 D6/D8): owner-only AND validated. Document shapes mirror
// packages/schema/src/race-day.ts as stored by the repository (instants are Timestamps).
// Fixtures are obviously fake; no real athlete data belongs in tests.

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

const NOW = Timestamp.fromDate(new Date("2026-10-24T12:00:00Z"));
const E = `${USERS}/alice/raceDay/test-event`;

const audit = () => ({ schemaVersion: 1, createdAt: NOW, updatedAt: NOW });
const pending = () => ({
  verification: "pending",
  source: "manual",
  sourceNote: "test fixture",
  verifiedAt: null,
});

const event = () => ({
  eventId: "test-event",
  name: "Test Championships",
  dates: ["2026-10-24", "2026-10-25"],
  timeZone: null,
  venue: null,
  ...pending(),
  ...audit(),
});

const rosterEntry = () => ({
  rosterId: "skater-1",
  displayName: "Test Skater",
  bib: "000",
  division: "Test Division",
  isSelf: true,
  isFollowed: false,
  athleteRefId: null,
  ...pending(),
  ...audit(),
});

const race = () => ({
  raceId: "race-1",
  distanceId: "500m",
  label: "500m",
  sortOrder: 1,
  day: null,
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: ["skater-1"],
  ...pending(),
  ...audit(),
});

const result = () => ({
  resultId: "race-1_skater-1",
  raceId: "race-1",
  rosterId: "skater-1",
  status: "finished",
  timeSeconds: 49.8,
  place: null,
  advanced: null,
  ...pending(),
  ...audit(),
});

const video = () => ({
  videoId: "video-1",
  raceId: "race-1",
  rosterId: "skater-1",
  label: "Test clip",
  externalUrl: null,
  storedWhere: null,
  note: null,
  ...audit(),
});

const summary = () => ({
  summaryVersion: "race-summary/1",
  generatedAt: null,
  coachNote: null,
  ...audit(),
});

type Doc = Record<string, unknown>;

const KINDS: Array<{ kind: string; path: string; make: () => Doc }> = [
  { kind: "event", path: E, make: event },
  { kind: "roster entry", path: `${E}/roster/skater-1`, make: rosterEntry },
  { kind: "race", path: `${E}/races/race-1`, make: race },
  { kind: "result", path: `${E}/results/race-1_skater-1`, make: result },
  { kind: "video", path: `${E}/videos/video-1`, make: video },
  { kind: "summary", path: `${E}/summaries/main`, make: summary },
];

const owner = () => env.authenticatedContext("alice").firestore();

describe.each(KINDS)("$kind: access", ({ path, make }) => {
  it("lets the owner create, read, update and delete a valid document", async () => {
    const db = owner();
    await assertSucceeds(setDoc(doc(db, path), make()));
    await assertSucceeds(getDoc(doc(db, path)));
    await assertSucceeds(updateDoc(doc(db, path), { updatedAt: NOW }));
    await assertSucceeds(deleteDoc(doc(db, path)));
  });

  it("denies another signed-in user", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), make());
    });
    const bob = env.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, path)));
    await assertFails(setDoc(doc(bob, path), make()));
    await assertFails(deleteDoc(doc(bob, path)));
  });

  it("denies unauthenticated access", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, path)));
    await assertFails(setDoc(doc(anon, path), make()));
  });
});

describe.each(KINDS)("$kind: validation", ({ path, make }) => {
  async function expectDenied(mutate: (d: Doc) => Doc) {
    await assertFails(setDoc(doc(owner(), path), mutate(make())));
  }

  it("denies an unknown extra field", async () => {
    await expectDenied((d) => ({ ...d, surprise: true }));
  });

  it("denies a missing required field", async () => {
    await expectDenied((d) => {
      const { schemaVersion: _omit, ...rest } = d;
      return rest;
    });
  });

  it("denies a wrong schema version", async () => {
    await expectDenied((d) => ({ ...d, schemaVersion: 2 }));
  });

  it("denies a non-timestamp updatedAt", async () => {
    await expectDenied((d) => ({ ...d, updatedAt: "2026-10-24" }));
  });

  it("denies changing createdAt on update", async () => {
    await assertSucceeds(setDoc(doc(owner(), path), make()));
    await assertFails(
      updateDoc(doc(owner(), path), {
        createdAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
      }),
    );
  });
});

// Kinds that carry verification (待确认) data.
const VERIFIABLE = KINDS.filter((k) => ["event", "roster entry", "race", "result"].includes(k.kind));

describe.each(VERIFIABLE)("$kind: provenance (待确认)", ({ path, make }) => {
  it("denies an unknown verification value", async () => {
    await assertFails(
      setDoc(doc(owner(), path), { ...make(), verification: "confirmed" }),
    );
  });

  it("denies pending data that carries a verification time", async () => {
    await assertFails(
      setDoc(doc(owner(), path), { ...make(), verifiedAt: NOW }),
    );
  });

  it("denies verified data without a verification time", async () => {
    await assertFails(
      setDoc(doc(owner(), path), { ...make(), verification: "verified" }),
    );
  });

  it("allows verified data with a verification time", async () => {
    await assertSucceeds(
      setDoc(doc(owner(), path), {
        ...make(),
        verification: "verified",
        verifiedAt: NOW,
      }),
    );
  });

  it("denies a source other than manual", async () => {
    await assertFails(setDoc(doc(owner(), path), { ...make(), source: "scraper" }));
  });
});

describe("ids", () => {
  it("denies a document whose stored id differs from its path", async () => {
    await assertFails(
      setDoc(doc(owner(), `${E}/races/race-1`), { ...race(), raceId: "other" }),
    );
  });

  it.each(["Race_1", "race 1", "-race", "race--1"])(
    "denies the invalid id %j",
    async (id) => {
      await assertFails(
        setDoc(doc(owner(), `${E}/races/${id}`), { ...race(), raceId: id }),
      );
    },
  );

  it("denies a result id that is not raceId_rosterId", async () => {
    await assertFails(
      setDoc(doc(owner(), `${E}/results/anything`), {
        ...result(),
        resultId: "anything",
      }),
    );
  });
});

describe("result rules mirror the domain validation", () => {
  const at = `${E}/results/race-1_skater-1`;
  const put = (patch: Doc) => setDoc(doc(owner(), at), { ...result(), ...patch });

  it("allows finished with a time and an optional place", async () => {
    await assertSucceeds(put({ place: 3, advanced: true }));
  });

  it.each([[null], [0], [-1], [1801], ["49.8"]])(
    "denies finished with time %j",
    async (timeSeconds) => {
      await assertFails(put({ timeSeconds }));
    },
  );

  it.each([[0], [-2], [1.5]])("denies place %d", async (place) => {
    await assertFails(put({ place }));
  });

  it.each(["DNS", "DNF", "DQ"])("allows %s with no time or place", async (status) => {
    await assertSucceeds(put({ status, timeSeconds: null, place: null }));
    await assertSucceeds(put({ status, timeSeconds: null, place: null, advanced: false }));
  });

  it.each(["DNS", "DNF", "DQ"])("denies a time on %s", async (status) => {
    await assertFails(put({ status, timeSeconds: 50 }));
  });

  it.each(["DNS", "DNF", "DQ"])("denies a place or advancement on %s", async (status) => {
    await assertFails(put({ status, timeSeconds: null, place: 1 }));
    await assertFails(put({ status, timeSeconds: null, advanced: true }));
  });

  it("denies an unknown status", async () => {
    await assertFails(put({ status: "WIN" }));
  });
});

describe("limits and shape", () => {
  it("denies an event with no dates or too many", async () => {
    const at = E;
    await assertFails(setDoc(doc(owner(), at), { ...event(), dates: [] }));
    await assertFails(
      setDoc(doc(owner(), at), {
        ...event(),
        dates: Array.from({ length: 11 }, () => "2026-10-24"),
      }),
    );
  });

  it("denies oversize text", async () => {
    await assertFails(
      setDoc(doc(owner(), E), { ...event(), name: "x".repeat(121) }),
    );
    await assertFails(
      setDoc(doc(owner(), `${E}/summaries/main`), {
        ...summary(),
        coachNote: "x".repeat(2001),
      }),
    );
  });

  it("denies a race day that is not a calendar date string", async () => {
    await assertFails(
      setDoc(doc(owner(), `${E}/races/race-1`), { ...race(), day: "Saturday" }),
    );
    await assertSucceeds(
      setDoc(doc(owner(), `${E}/races/race-1`), { ...race(), day: "2026-10-24" }),
    );
  });

  it("allows a known scheduled time and denies a non-timestamp one", async () => {
    await assertSucceeds(
      setDoc(doc(owner(), `${E}/races/race-1`), { ...race(), scheduledAt: NOW }),
    );
    await assertFails(
      setDoc(doc(owner(), `${E}/races/race-1`), {
        ...race(),
        scheduledAt: "2026-10-24T09:00",
      }),
    );
  });

  it("denies a summary document with an id other than main", async () => {
    await assertFails(setDoc(doc(owner(), `${E}/summaries/other`), summary()));
  });

  it("denies writes to unknown subcollections under raceDay", async () => {
    await assertFails(setDoc(doc(owner(), `${E}/notes/n1`), { text: "x" }));
  });
});

// ADR-001 D4: video collection stores metadata only. The fixed key set means no file
// content, blob or frame data can be stored through this path.
describe("video metadata only", () => {
  const at = `${E}/videos/video-1`;

  it("denies attaching media or file content fields", async () => {
    await assertFails(setDoc(doc(owner(), at), { ...video(), fileBytes: "AAAA" }));
    await assertFails(setDoc(doc(owner(), at), { ...video(), frames: ["x"] }));
  });

  it("allows an https link and denies other schemes", async () => {
    await assertSucceeds(
      setDoc(doc(owner(), at), { ...video(), externalUrl: "https://example.com/clip" }),
    );
    await assertFails(
      setDoc(doc(owner(), at), { ...video(), externalUrl: "javascript:alert(1)" }),
    );
    await assertFails(
      setDoc(doc(owner(), at), { ...video(), externalUrl: "file:///tmp/clip.mp4" }),
    );
  });
});
