import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import {
  encodeRaceCreate,
  encodeRaceEventCreate,
  encodeRaceEventUpdate,
  encodeRaceResultCreate,
  encodeRaceResultUpdate,
  encodeRaceUpdate,
  encodeRosterEntryCreate,
  encodeRosterEntryUpdate,
  encodeVerification,
  parseRaceEntry,
  parseRaceEvent,
  parseRaceResult,
  parseRosterEntry,
} from "./race-day-codec";

// Fixtures are obviously fake: no real athlete, bib or event data in tests.

const NOW = Timestamp.fromDate(new Date("2026-10-24T12:00:00Z"));
const NOW_ISO = "2026-10-24T12:00:00.000Z";

const keys = (o: object) => Object.keys(o).sort();

/** Replaces `serverTimestamp()` sentinels with a fixed Timestamp so documents can be parsed. */
function materialize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const isPlainValue =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value instanceof Timestamp;
    out[key] = isPlainValue ? value : NOW;
  }
  return out;
}

const eventInput = {
  name: "Test Championships",
  dates: ["2026-10-24", "2026-10-25"],
  timeZone: "America/New_York",
  venue: null,
  sourceNote: "test",
};
const rosterInput = {
  displayName: "Test Skater",
  bib: "000",
  division: "Test Division",
  isSelf: true,
  isFollowed: false,
  athleteRefId: "test-athlete",
  sourceNote: "",
};
const raceInput = {
  distanceId: "500m",
  label: "500m",
  sortOrder: 1,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: "2026-10-24T13:30:00.000Z",
  rosterIds: ["skater-1"],
  sourceNote: "",
};

const storedEvent = () => ({
  eventId: "ev-1",
  name: "Test Championships",
  dates: ["2026-10-24"],
  timeZone: null,
  venue: null,
  verification: "pending",
  source: "manual",
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
});
const storedRoster = () => ({
  rosterId: "sk-1",
  displayName: "Test Skater",
  bib: "000",
  division: "D",
  isSelf: false,
  isFollowed: true,
  athleteRefId: null,
  verification: "pending",
  source: "manual",
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
});
const storedRace = () => ({
  raceId: "r-1",
  distanceId: "500m",
  label: "500m",
  sortOrder: 1,
  day: null,
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: [],
  verification: "pending",
  source: "manual",
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
});

const PROVENANCE_AND_AUDIT = [
  "createdAt",
  "schemaVersion",
  "source",
  "sourceNote",
  "updatedAt",
  "verification",
  "verifiedAt",
];

describe("encode create: exact key sets (must match firestore.rules)", () => {
  it("event", () => {
    expect(keys(encodeRaceEventCreate("ev-1", eventInput))).toEqual(
      ["dates", "eventId", "name", "timeZone", "venue", ...PROVENANCE_AND_AUDIT].sort(),
    );
  });
  it("roster entry", () => {
    expect(keys(encodeRosterEntryCreate("sk-1", rosterInput))).toEqual(
      [
        "athleteRefId",
        "bib",
        "displayName",
        "division",
        "isFollowed",
        "isSelf",
        "rosterId",
        ...PROVENANCE_AND_AUDIT,
      ].sort(),
    );
  });
  it("race", () => {
    expect(keys(encodeRaceCreate("r-1", raceInput))).toEqual(
      [
        "day",
        "distanceId",
        "heat",
        "label",
        "raceId",
        "rosterIds",
        "round",
        "scheduledAt",
        "sortOrder",
        ...PROVENANCE_AND_AUDIT,
      ].sort(),
    );
  });
});

describe("encode create: values", () => {
  const created = encodeRaceEventCreate("ev-1", eventInput);

  it("always starts pending, with no verification time", () => {
    expect(created).toMatchObject({
      verification: "pending",
      source: "manual",
      verifiedAt: null,
      schemaVersion: 1,
    });
  });

  it("uses explicit null for unknown values and never undefined (Firestore rejects undefined)", () => {
    expect(created.venue).toBeNull();
    for (const doc of [
      created,
      encodeRosterEntryCreate("sk-1", rosterInput),
      encodeRaceCreate("r-1", { ...raceInput, scheduledAt: null }),
      encodeRaceEventUpdate(eventInput),
    ]) {
      expect(Object.values(doc).includes(undefined)).toBe(false);
    }
  });

  it("stamps createdAt and updatedAt with server time, not a client value", () => {
    expect(created.createdAt).toBeDefined();
    expect(created.createdAt).not.toBeInstanceOf(Timestamp);
    expect(created.updatedAt).not.toBeInstanceOf(Timestamp);
  });

  it("encodes scheduledAt as an exact Firestore Timestamp, and null stays null", () => {
    const race = encodeRaceCreate("r-1", raceInput);
    expect(race.scheduledAt).toBeInstanceOf(Timestamp);
    expect((race.scheduledAt as Timestamp).toMillis()).toBe(Date.parse("2026-10-24T13:30:00.000Z"));
    expect(encodeRaceCreate("r-1", { ...raceInput, scheduledAt: null }).scheduledAt).toBeNull();
  });

  it("refuses to encode an invalid instant instead of writing a wrong time", () => {
    expect(() => encodeRaceCreate("r-1", { ...raceInput, scheduledAt: "not a time" })).toThrow(
      /invalid instant/,
    );
  });
});

describe("encode update", () => {
  it("resets verification to pending and bumps updatedAt, and never touches identity or createdAt", () => {
    for (const doc of [
      encodeRaceEventUpdate(eventInput),
      encodeRosterEntryUpdate(rosterInput),
      encodeRaceUpdate(raceInput),
    ]) {
      expect(doc).toMatchObject({ verification: "pending", verifiedAt: null, source: "manual" });
      expect(doc.updatedAt).toBeDefined();
      for (const forbidden of ["createdAt", "schemaVersion", "eventId", "rosterId", "raceId"]) {
        expect(forbidden in doc).toBe(false);
      }
    }
  });
});

describe("encodeVerification", () => {
  it("marks verified with a server-time verifiedAt", () => {
    const doc = encodeVerification(true);
    expect(doc.verification).toBe("verified");
    expect(doc.verifiedAt).toBeDefined();
    expect(doc.verifiedAt).not.toBeNull();
    expect(keys(doc)).toEqual(["updatedAt", "verification", "verifiedAt"]);
  });
  it("returns to pending with verifiedAt null", () => {
    expect(encodeVerification(false)).toMatchObject({ verification: "pending", verifiedAt: null });
  });
});

describe("round trip: parse(encode(x)) returns the input", () => {
  it("event", () => {
    const parsed = parseRaceEvent("ev-1", materialize(encodeRaceEventCreate("ev-1", eventInput)));
    expect(parsed).toMatchObject({ ok: true, value: { ...eventInput, eventId: "ev-1", verification: "pending" } });
  });
  it("roster entry", () => {
    const parsed = parseRosterEntry("sk-1", materialize(encodeRosterEntryCreate("sk-1", rosterInput)));
    expect(parsed).toMatchObject({ ok: true, value: { ...rosterInput, rosterId: "sk-1" } });
  });
  it("race, with the instant returned as the same ISO string", () => {
    const parsed = parseRaceEntry("r-1", materialize(encodeRaceCreate("r-1", raceInput)));
    expect(parsed).toMatchObject({
      ok: true,
      value: { ...raceInput, raceId: "r-1", scheduledAt: raceInput.scheduledAt },
    });
  });
});

describe("parse: valid documents", () => {
  it("converts Timestamps to ISO strings", () => {
    const parsed = parseRaceEvent("ev-1", storedEvent());
    expect(parsed).toMatchObject({ ok: true, value: { createdAt: NOW_ISO, updatedAt: NOW_ISO, verifiedAt: null } });
  });

  it("accepts a verified document with a verification time", () => {
    const parsed = parseRosterEntry("sk-1", { ...storedRoster(), verification: "verified", verifiedAt: NOW });
    expect(parsed).toMatchObject({ ok: true, value: { verification: "verified", verifiedAt: NOW_ISO } });
  });

  it("ignores unknown extra fields rather than failing the whole list", () => {
    expect(parseRaceEvent("ev-1", { ...storedEvent(), surprise: 1 }).ok).toBe(true);
  });
});

describe("parse: invalid documents are reported, never guessed at", () => {
  const bad = (result: { ok: boolean }) => expect(result.ok).toBe(false);

  it("rejects non-objects", () => {
    for (const value of [null, undefined, "x", 3, [], true]) {
      bad(parseRaceEvent("ev-1", value));
      bad(parseRosterEntry("sk-1", value));
      bad(parseRaceEntry("r-1", value));
    }
  });

  it("rejects an id that does not match the document id", () => {
    bad(parseRaceEvent("other", storedEvent()));
    bad(parseRosterEntry("other", storedRoster()));
    bad(parseRaceEntry("other", storedRace()));
  });

  it("rejects an unsupported schemaVersion with a clear reason", () => {
    const result = parseRaceEvent("ev-1", { ...storedEvent(), schemaVersion: 2 });
    expect(result).toEqual({ ok: false, reason: "unsupported schemaVersion: 2" });
  });

  it("rejects an unknown verification value", () => {
    bad(parseRaceEvent("ev-1", { ...storedEvent(), verification: "confirmed" }));
  });

  it("rejects 'verified' without a verification time, and 'pending' with one", () => {
    bad(parseRaceEvent("ev-1", { ...storedEvent(), verification: "verified", verifiedAt: null }));
    bad(parseRaceEvent("ev-1", { ...storedEvent(), verifiedAt: NOW }));
  });

  it("rejects a source other than manual", () => {
    bad(parseRaceEvent("ev-1", { ...storedEvent(), source: "scraped" }));
  });

  it("rejects missing or non-timestamp createdAt/updatedAt", () => {
    bad(parseRaceEvent("ev-1", { ...storedEvent(), createdAt: null }));
    bad(parseRaceEvent("ev-1", { ...storedEvent(), updatedAt: "2026-10-24" }));
  });

  it("rejects wrong field types and missing keys", () => {
    bad(parseRaceEvent("ev-1", { ...storedEvent(), name: 5 }));
    bad(parseRaceEvent("ev-1", { ...storedEvent(), dates: [1] }));
    const { timeZone: _timeZone, ...withoutTimeZone } = storedEvent();
    bad(parseRaceEvent("ev-1", withoutTimeZone));
    bad(parseRosterEntry("sk-1", { ...storedRoster(), bib: 7 }));
    bad(parseRosterEntry("sk-1", { ...storedRoster(), isSelf: "yes" }));
    bad(parseRaceEntry("r-1", { ...storedRace(), sortOrder: 1.5 }));
    bad(parseRaceEntry("r-1", { ...storedRace(), rosterIds: "a" }));
    bad(parseRaceEntry("r-1", { ...storedRace(), scheduledAt: "2026-10-24T13:30:00Z" }));
  });
});

// --- race results -----------------------------------------------------------------

const resultInput = {
  status: "finished" as const,
  timeSeconds: 49.123,
  place: 2,
  advanced: true,
  sourceNote: "board photo",
};

const storedResult = (over: Record<string, unknown> = {}) => ({
  resultId: "race-1_sk-1",
  raceId: "race-1",
  rosterId: "sk-1",
  status: "finished",
  timeSeconds: 49.123,
  place: 2,
  advanced: true,
  verification: "pending",
  source: "manual",
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? "ok" : r.reason);

describe("race result: encode", () => {
  it("create has exactly the key set firestore.rules demands", () => {
    expect(keys(encodeRaceResultCreate("race-1_sk-1", "race-1", "sk-1", resultInput))).toEqual(
      [
        "advanced",
        "place",
        "raceId",
        "resultId",
        "rosterId",
        "status",
        "timeSeconds",
        ...PROVENANCE_AND_AUDIT,
      ].sort(),
    );
  });

  it("create starts pending, with explicit nulls for a non-finished status", () => {
    const data = encodeRaceResultCreate("race-1_sk-1", "race-1", "sk-1", {
      status: "DNS",
      timeSeconds: null,
      place: null,
      advanced: null,
      sourceNote: "",
    });
    expect(data).toMatchObject({
      verification: "pending",
      verifiedAt: null,
      status: "DNS",
      timeSeconds: null,
      place: null,
      advanced: null,
    });
    expect(Object.values(data)).not.toContain(undefined);
  });

  it("update returns to pending and never touches ids or createdAt", () => {
    const data = encodeRaceResultUpdate(resultInput);
    expect(data).toMatchObject({ verification: "pending", verifiedAt: null, timeSeconds: 49.123 });
    for (const key of ["resultId", "raceId", "rosterId", "createdAt", "schemaVersion"]) {
      expect(data).not.toHaveProperty(key);
    }
    expect(data).toHaveProperty("updatedAt");
  });

  it("round trip: parse(encode(x)) returns the input", () => {
    const parsed = parseRaceResult(
      "race-1_sk-1",
      materialize(encodeRaceResultCreate("race-1_sk-1", "race-1", "sk-1", resultInput)),
    );
    expect(parsed).toMatchObject({
      ok: true,
      value: { resultId: "race-1_sk-1", status: "finished", timeSeconds: 49.123, place: 2, advanced: true },
    });
  });
});

describe("race result: parse", () => {
  it("accepts a valid finished and a valid non-finished result", () => {
    expect(parseRaceResult("race-1_sk-1", storedResult())).toMatchObject({ ok: true });
    expect(
      parseRaceResult(
        "race-1_sk-1",
        storedResult({ status: "DQ", timeSeconds: null, place: null, advanced: false }),
      ),
    ).toMatchObject({ ok: true, value: { status: "DQ", timeSeconds: null, advanced: false } });
  });

  it("accepts three decimals and the boundary times, including values like 1.005", () => {
    for (const timeSeconds of [0.001, 1.005, 49.123, 104.231, 1800]) {
      expect(parseRaceResult("race-1_sk-1", storedResult({ timeSeconds }))).toMatchObject({ ok: true });
    }
  });

  it("rejects a time with more than three decimals", () => {
    expect(reason(parseRaceResult("race-1_sk-1", storedResult({ timeSeconds: 49.1234 })))).toBe(
      "time has more than three decimals",
    );
  });

  it.each([0, -1, 1800.001, Number.NaN, Number.POSITIVE_INFINITY, "49.1", null])(
    "rejects a finished result whose time is %s",
    (timeSeconds) => {
      expect(reason(parseRaceResult("race-1_sk-1", storedResult({ timeSeconds })))).toBe(
        "finished result without a valid time",
      );
    },
  );

  it("rejects a non-finished result that carries a time, a place or advancement", () => {
    const base = { status: "DNF", timeSeconds: null, place: null, advanced: null };
    expect(parseRaceResult("race-1_sk-1", storedResult(base))).toMatchObject({ ok: true });
    for (const over of [{ timeSeconds: 50 }, { place: 3 }, { advanced: true }]) {
      expect(reason(parseRaceResult("race-1_sk-1", storedResult({ ...base, ...over })))).toBe(
        "result that was not finished carries a time, place or advancement",
      );
    }
  });

  it.each([0, 1.5, "2", undefined])("rejects place %s", (place) => {
    expect(reason(parseRaceResult("race-1_sk-1", storedResult({ place })))).toBe("invalid place");
  });

  it("rejects a non-boolean advanced and an unknown status", () => {
    expect(reason(parseRaceResult("race-1_sk-1", storedResult({ advanced: "yes" })))).toBe("invalid advanced");
    expect(reason(parseRaceResult("race-1_sk-1", storedResult({ status: "won" })))).toBe("invalid status");
  });

  it("rejects ids that do not match the document id or each other", () => {
    expect(reason(parseRaceResult("race-1_sk-2", storedResult()))).toBe("result ids do not match the document id");
    expect(reason(parseRaceResult("race-1_sk-1", storedResult({ rosterId: "sk-2" })))).toBe(
      "result ids do not match the document id",
    );
    expect(reason(parseRaceResult("race-1_sk-1", storedResult({ resultId: "x" })))).toBe(
      "result ids do not match the document id",
    );
  });

  it("shares the provenance checks with the other documents", () => {
    expect(reason(parseRaceResult("race-1_sk-1", storedResult({ verification: "verified" })))).toBe(
      "verified without a valid verifiedAt",
    );
    expect(reason(parseRaceResult("race-1_sk-1", storedResult({ schemaVersion: 2 })))).toBe(
      "unsupported schemaVersion: 2",
    );
  });
});
