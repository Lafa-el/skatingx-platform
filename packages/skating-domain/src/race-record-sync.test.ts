import type { RaceEntry, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import {
  createRaceRecordEntryId,
  isRaceSyncedEntryId,
  mapRaceDistanceToRecordDistance,
  parseRaceRecordEntryId,
  planRaceRecords,
  reconcileRaceEntries,
  type DesiredRaceRecord,
  type RaceRecordSourceEvent,
  type RaceRecordSources,
} from "./race-record-sync";

const NOW = "2026-10-30T12:00:00.000Z";
const EVENT = "buffalo-championships-2026";

const provenance = { verification: "verified", source: "manual", sourceNote: "", verifiedAt: null } as const;
const audit = { schemaVersion: 1 } as const;

const roster = (rosterId: string, over: Partial<RaceRosterEntry> = {}): RaceRosterEntry => ({
  ...provenance,
  ...audit,
  rosterId,
  displayName: rosterId,
  bib: "",
  division: "",
  isSelf: false,
  isFollowed: false,
  athleteRefId: null,
  ...over,
});

const me = roster("lindsay", { isSelf: true, athleteRefId: "lindsay" });

const race = (raceId: string, distanceId: string, over: Partial<RaceEntry> = {}): RaceEntry => ({
  ...provenance,
  ...audit,
  raceId,
  distanceId,
  label: distanceId,
  sortOrder: 0,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: [],
  ...over,
});

const result = (raceId: string, rosterId: string, over: Partial<RaceResult> = {}): RaceResult => ({
  ...provenance,
  ...audit,
  resultId: `${raceId}_${rosterId}`,
  raceId,
  rosterId,
  status: "finished",
  timeSeconds: 48.123,
  place: 1,
  advanced: null,
  ...over,
});

const source = (over: Partial<RaceRecordSourceEvent> = {}): RaceRecordSourceEvent => ({
  event: { eventId: EVENT, name: "Buffalo", dates: ["2026-10-24", "2026-10-25"] },
  races: [race("500m-1", "500m")],
  roster: [me],
  results: [result("500m-1", "lindsay")],
  complete: true,
  ...over,
});

const sources = (events: RaceRecordSourceEvent[], over: Partial<RaceRecordSources> = {}): RaceRecordSources => ({
  events,
  eventsComplete: true,
  unknownEventIds: [],
  ...over,
});

const plan = (s: RaceRecordSources, athleteId = "lindsay") => planRaceRecords({ sources: s, athleteId });

describe("entry ids", () => {
  it("is race_{eventId}_{raceId} and parses back", () => {
    const id = createRaceRecordEntryId(EVENT, "500m-1");
    expect(id).toBe("race_buffalo-championships-2026_500m-1");
    expect(parseRaceRecordEntryId(id)).toEqual({ eventId: EVENT, raceId: "500m-1" });
    expect(isRaceSyncedEntryId(id)).toBe(true);
  });

  it("does not depend on the roster id", () => {
    const a = plan(sources([source({ roster: [me], results: [result("500m-1", "lindsay")] })]));
    const rebuilt = roster("lindsay-2", { isSelf: true, athleteRefId: "lindsay" });
    const b = plan(sources([source({ roster: [rebuilt], results: [result("500m-1", "lindsay-2")] })]));
    expect(a.desired.map((d) => d.entryId)).toEqual(b.desired.map((d) => d.entryId));
  });

  it("rejects ids that are not exactly that shape, so they are never owned", () => {
    for (const id of [
      "time_1700000000000_abc",
      "legacy-time-500m-0",
      "race_",
      "race_x",
      "race_a_b_c",
      "race_A_b",
      "race__b",
      "race_a_",
    ]) {
      expect(parseRaceRecordEntryId(id), id).toBeNull();
      expect(isRaceSyncedEntryId(id), id).toBe(false);
    }
  });
});

describe("distance mapping", () => {
  it.each(["333m", "500m", "777m", "1000m", "1500m"])("%s passes through", (id) => {
    expect(mapRaceDistanceToRecordDistance(id)).toBe(id);
  });

  it("maps super_1500m into 1500m", () => {
    expect(mapRaceDistanceToRecordDistance("super_1500m")).toBe("1500m");
  });

  it.each(["start_lap", "fastest_lap", "2000m", "", "toString", "__proto__"])("does not map %s", (id) => {
    expect(mapRaceDistanceToRecordDistance(id)).toBeNull();
  });
});

describe("planRaceRecords: what should exist", () => {
  it("plans one entry for a confirmed, finished result of the athlete, with the stored seconds", () => {
    const p = plan(sources([source()]));
    expect(p.desired).toEqual<DesiredRaceRecord[]>([
      {
        entryId: "race_buffalo-championships-2026_500m-1",
        eventId: EVENT,
        raceId: "500m-1",
        recordDistanceId: "500m",
        date: "2026-10-24",
        timeSeconds: 48.123,
        note: "Buffalo · 500m",
      },
    ]);
  });

  it("does not plan a result that is only entered (pending)", () => {
    const p = plan(sources([source({ results: [result("500m-1", "lindsay", { verification: "pending" })] })]));
    expect(p.desired).toEqual([]);
    expect(p.skipped).toEqual([{ eventId: EVENT, resultId: "500m-1_lindsay", reason: "not-confirmed" }]);
  });

  it.each(["DNS", "DNF", "DQ"] as const)("does not plan %s, which has no time", (status) => {
    const p = plan(sources([source({ results: [result("500m-1", "lindsay", { status, timeSeconds: null })] })]));
    expect(p.desired).toEqual([]);
    expect(p.skipped[0]?.reason).toBe("not-finished");
  });

  it.each([null, 0, -1, Number.NaN, 1801])("does not plan a finished result with time %s", (timeSeconds) => {
    const p = plan(sources([source({ results: [result("500m-1", "lindsay", { timeSeconds })] })]));
    expect(p.desired).toEqual([]);
    expect(p.skipped[0]?.reason).toBe("invalid-time");
  });

  it("puts Super 1500m into 1500m and keeps the project name in the note", () => {
    const p = plan(
      sources([
        source({
          races: [race("super-1500m", "super_1500m", { label: "Super 1500m" })],
          results: [result("super-1500m", "lindsay", { timeSeconds: 150.5 })],
        }),
      ]),
    );
    expect(p.desired).toHaveLength(1);
    expect(p.desired[0]).toMatchObject({
      entryId: "race_buffalo-championships-2026_super-1500m",
      recordDistanceId: "1500m",
      note: "Buffalo · Super 1500m",
      timeSeconds: 150.5,
    });
  });

  it("plans each distance into its own document, 777m and 333m included", () => {
    const p = plan(
      sources([
        source({
          races: [race("a", "333m"), race("b", "777m"), race("c", "1000m"), race("d", "1500m")],
          results: ["a", "b", "c", "d"].map((id) => result(id, "lindsay")),
        }),
      ]),
    );
    expect(p.desired.map((d) => d.recordDistanceId).sort()).toEqual(["1000m", "1500m", "333m", "777m"]);
  });

  it("skips a distance that has no record page, with the reason", () => {
    const p = plan(sources([source({ races: [race("500m-1", "fastest_lap")] })]));
    expect(p.desired).toEqual([]);
    expect(p.skipped[0]?.reason).toBe("unmapped-distance");
  });

  it("skips a result whose race is missing", () => {
    const p = plan(sources([source({ races: [] })]));
    expect(p.desired).toEqual([]);
    expect(p.skipped[0]?.reason).toBe("race-missing");
  });

  it("syncs only the athlete's own results: followed and other roster rows are ignored", () => {
    const other = roster("sam", { isFollowed: true });
    const p = plan(
      sources([
        source({
          roster: [me, other],
          results: [result("500m-1", "lindsay"), result("500m-1", "sam", { timeSeconds: 40 })],
        }),
      ]),
    );
    expect(p.desired).toHaveLength(1);
    expect(p.desired[0]?.timeSeconds).toBe(48.123);
    expect(p.skipped).toEqual([]);
  });

  it("plans nothing when the self row is not linked to an athlete or to the current one", () => {
    const unlinked = roster("lindsay", { isSelf: true, athleteRefId: null });
    expect(plan(sources([source({ roster: [unlinked] })])).desired).toEqual([]);
    expect(plan(sources([source()]), "someone-else").desired).toEqual([]);
  });

  it("with several self rows, uses the first by id like the summary page", () => {
    const first = roster("a-self", { isSelf: true, athleteRefId: "lindsay" });
    const second = roster("b-self", { isSelf: true, athleteRefId: "lindsay" });
    const p = plan(
      sources([source({ roster: [second, first], results: [result("500m-1", "a-self"), result("500m-1", "b-self")] })]),
    );
    expect(p.desired).toHaveLength(1);
  });

  describe("the day", () => {
    it("uses the race's own day", () => {
      const p = plan(sources([source({ races: [race("500m-1", "500m", { day: "2026-10-25" })] })]));
      expect(p.desired[0]?.date).toBe("2026-10-25");
    });

    it("uses the event's only day when the race has none", () => {
      const p = plan(
        sources([
          source({
            event: { eventId: EVENT, name: "Buffalo", dates: ["2026-10-24"] },
            races: [race("500m-1", "500m", { day: null })],
          }),
        ]),
      );
      expect(p.desired[0]?.date).toBe("2026-10-24");
    });

    it("does not guess a day in a multi-day event", () => {
      const p = plan(sources([source({ races: [race("500m-1", "500m", { day: null })] })]));
      expect(p.desired).toEqual([]);
      expect(p.skipped[0]?.reason).toBe("no-date");
    });

    it("does not accept a day that is not a real date", () => {
      const p = plan(sources([source({ races: [race("500m-1", "500m", { day: "2026-02-30" })] })]));
      expect(p.desired).toEqual([]);
      expect(p.skipped[0]?.reason).toBe("no-date");
    });
  });
});

describe("planRaceRecords: when an entry may be removed", () => {
  it("allows it for an event that was read completely", () => {
    expect(plan(sources([source()])).canRemoveEntriesOf(EVENT)).toBe(true);
  });

  it("allows it for an event that is gone from a completely read list", () => {
    expect(plan(sources([])).canRemoveEntriesOf(EVENT)).toBe(true);
  });

  it("forbids it for an event whose roster, races or results were not read completely", () => {
    expect(plan(sources([source({ complete: false })])).canRemoveEntriesOf(EVENT)).toBe(false);
  });

  it("forbids it for every event when the event list was not read completely", () => {
    const p = plan(sources([source()], { eventsComplete: false }));
    expect(p.canRemoveEntriesOf(EVENT)).toBe(false);
    expect(p.canRemoveEntriesOf("deleted-event")).toBe(false);
  });

  it("forbids it for an event document that exists but could not be read", () => {
    const p = plan(sources([], { unknownEventIds: [EVENT] }));
    expect(p.canRemoveEntriesOf(EVENT)).toBe(false);
    expect(p.canRemoveEntriesOf("other-event")).toBe(true);
  });
});

describe("reconcileRaceEntries", () => {
  const id = "race_buffalo-championships-2026_500m-1";
  const desired: DesiredRaceRecord = {
    entryId: id,
    eventId: EVENT,
    raceId: "500m-1",
    recordDistanceId: "500m",
    date: "2026-10-24",
    timeSeconds: 48.123,
    note: "Buffalo · 500m",
  };
  const run = (
    existing: unknown[],
    wanted: DesiredRaceRecord[],
    canRemove = true,
  ) => reconcileRaceEntries({ existing, desired: wanted, canRemoveEntriesOf: () => canRemove, nowIso: NOW });

  const manual = { id: "time_1_a", date: "2026-09-01", timeSeconds: 51.2, source: "manual", createdAt: "x" };

  it("adds a missing entry with source race, the date, the seconds and createdAt/updatedAt", () => {
    const out = run([manual], [desired]);
    expect(out).toMatchObject({ added: 1, updated: 0, removed: 0 });
    expect(out.entries).toEqual([
      manual,
      {
        id,
        date: "2026-10-24",
        timeSeconds: 48.123,
        note: "Buffalo · 500m",
        source: "race",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });

  it("is idempotent: confirming again and again leaves exactly one entry and changes nothing", () => {
    const first = run([manual], [desired]);
    const second = run(first.entries, [desired]);
    const third = run(second.entries, [desired]);
    expect(second).toMatchObject({ added: 0, updated: 0, removed: 0 });
    expect(third.entries).toEqual(first.entries);
    expect(third.entries.filter((e) => (e as { id: string }).id === id)).toHaveLength(1);
  });

  it("updates an edited result in place, keeps createdAt, and never duplicates", () => {
    const first = run([], [desired]);
    const faster = { ...desired, timeSeconds: 47.5, date: "2026-10-25" };
    const later = "2026-10-31T00:00:00.000Z";
    const out = reconcileRaceEntries({
      existing: first.entries,
      desired: [faster],
      canRemoveEntriesOf: () => true,
      nowIso: later,
    });
    expect(out).toMatchObject({ added: 0, updated: 1, removed: 0 });
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ id, timeSeconds: 47.5, date: "2026-10-25", createdAt: NOW, updatedAt: later });
  });

  it("edit -> pending -> entry removed -> confirm again -> added with the new value, still one", () => {
    const confirmed = run([manual], [desired]);
    const pending = run(confirmed.entries, []); // result went back to pending: nothing desired
    expect(pending).toMatchObject({ removed: 1 });
    expect(pending.entries).toEqual([manual]);
    const again = run(pending.entries, [{ ...desired, timeSeconds: 47.9 }]);
    expect(again).toMatchObject({ added: 1 });
    const mine = again.entries.filter((e) => (e as { id: string }).id === id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ timeSeconds: 47.9 });
  });

  it("removes the entry when its source is gone and removal is allowed", () => {
    const existing = run([], [desired]).entries;
    expect(run(existing, [], true)).toMatchObject({ removed: 1, entries: [] });
  });

  it("keeps the entry when removal is not allowed (incomplete read)", () => {
    const existing = run([], [desired]).entries;
    const out = run(existing, [], false);
    expect(out).toMatchObject({ added: 0, updated: 0, removed: 0 });
    expect(out.entries).toEqual(existing);
  });

  it("asks per event: removes one event's entry and keeps another's", () => {
    const other = { ...desired, entryId: "race_other-event_500m-1", eventId: "other-event" };
    const existing = run([], [desired, other]).entries;
    const out = reconcileRaceEntries({
      existing,
      desired: [],
      canRemoveEntriesOf: (eventId) => eventId === EVENT,
      nowIso: NOW,
    });
    expect(out.removed).toBe(1);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ id: "race_other-event_500m-1" });
  });

  it("returns entries it does not own exactly as read, even malformed ones", () => {
    const legacy = { id: "legacy-time-500m-0", date: "2026-01-01", timeSeconds: 55, createdAt: "y" };
    const malformed = { id: "time_2_b", date: "", timeSeconds: 0 };
    const lookalike = { id: "race_oops", date: "2026-01-01", timeSeconds: 40, source: "race", createdAt: "z" };
    const junk = "not an object";
    const existing = [legacy, malformed, lookalike, junk, null, manual];
    const out = run(existing, [desired]);
    expect(out.entries.slice(0, existing.length)).toEqual(existing);
    expect(out).toMatchObject({ added: 1, updated: 0, removed: 0 });
  });

  it("does not touch a user-typed entry whose source is race", () => {
    const typed = { id: "time_3_c", date: "2026-10-12", timeSeconds: 49.8, source: "race", createdAt: "w" };
    expect(run([typed], [], true)).toMatchObject({ removed: 0, entries: [typed] });
  });

  it("collapses a duplicate of one id to the first copy", () => {
    const [entry] = run([], [desired]).entries;
    const out = run([entry, { ...(entry as object) }], [desired]);
    expect(out.removed).toBe(1);
    expect(out.entries).toHaveLength(1);
  });

  it("repairs an owned entry whose source is not race", () => {
    const wrong = { id, date: "2026-10-24", timeSeconds: 48.123, note: "Buffalo · 500m", source: "manual", createdAt: "c" };
    const out = run([wrong], [desired]);
    expect(out.updated).toBe(1);
    expect(out.entries[0]).toMatchObject({ source: "race", createdAt: "c" });
  });
});

describe("end to end: plan + reconcile", () => {
  const records = (entries: unknown[], sourceSet: RaceRecordSources, athleteId = "lindsay") => {
    const p = planRaceRecords({ sources: sourceSet, athleteId });
    return reconcileRaceEntries({
      existing: entries,
      desired: p.desired.filter((d) => d.recordDistanceId === "500m"),
      canRemoveEntriesOf: p.canRemoveEntriesOf,
      nowIso: NOW,
    }).entries as { id: string; timeSeconds: number }[];
  };

  it("rebuilding the roster row (new rosterId) does not duplicate the entry", () => {
    const first = records([], sources([source()]));
    const rebuilt = roster("lindsay-b", { isSelf: true, athleteRefId: "lindsay" });
    const after = records(
      first,
      sources([source({ roster: [rebuilt], results: [result("500m-1", "lindsay-b")] })]),
    );
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe("race_buffalo-championships-2026_500m-1");
  });

  it("deleting the race, the roster row or the event removes the entry; a partial read keeps it", () => {
    const existing = records([], sources([source()]));
    expect(existing).toHaveLength(1);

    expect(records(existing, sources([source({ races: [], results: [] })]))).toHaveLength(0); // race deleted
    expect(records(existing, sources([source({ roster: [], results: [] })]))).toHaveLength(0); // roster row deleted
    expect(records(existing, sources([]))).toHaveLength(0); // event deleted

    expect(records(existing, sources([source({ races: [], results: [], complete: false })]))).toHaveLength(1);
    expect(records(existing, sources([], { eventsComplete: false }))).toHaveLength(1);
  });

  it("another athlete's results never reach this athlete's records", () => {
    const others = roster("sam", { isSelf: true, athleteRefId: "sam" });
    const out = records([], sources([source({ roster: [others], results: [result("500m-1", "sam")] })]));
    expect(out).toEqual([]);
  });

  it("the PB stays the plain minimum: a synced entry only adds a candidate", () => {
    const slower = { id: "time_9_z", date: "2026-09-01", timeSeconds: 51.2, source: "manual", createdAt: "x" };
    const out = records([slower], sources([source()]));
    expect(Math.min(...out.map((e) => e.timeSeconds))).toBe(48.123);
  });
});
