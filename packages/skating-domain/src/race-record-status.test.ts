import type { RaceEntry, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import { deriveResultSyncInfo, type StoredRaceEntry } from "./race-record-status";
import { createRaceRecordEntryId, planRaceRecords, reconcileRaceEntries } from "./race-record-sync";

const NOW = "2026-10-30T12:00:00.000Z";
const EVENT_ID = "buffalo-2026";
const EVENT = { eventId: EVENT_ID, name: "Buffalo", dates: ["2026-10-24", "2026-10-25"] };

const provenance = { verification: "verified", source: "manual", sourceNote: "", verifiedAt: null } as const;
const audit = { schemaVersion: 1 } as const;

const person = (rosterId: string, over: Partial<RaceRosterEntry> = {}): RaceRosterEntry => ({
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
const me = person("lindsay", { isSelf: true, athleteRefId: "lindsay" });
const other = person("ann", { isFollowed: true });

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
  // Everyone the tests below use is on the race; the removed-from-race cases override this.
  rosterIds: ["lindsay", "ann", "zed", "amy"],
  ...over,
});

const row = (raceId: string, rosterId: string, over: Partial<RaceResult> = {}): RaceResult => ({
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

const pending = { verification: "pending" } as const;

type Input = Parameters<typeof deriveResultSyncInfo>[0];
const derive = (over: Partial<Input> = {}) =>
  deriveResultSyncInfo({
    event: EVENT,
    races: [race("500m-1", "500m")],
    roster: [me, other],
    results: [row("500m-1", "lindsay")],
    athleteId: "lindsay",
    recorded: new Map(),
    ...over,
  });

const entryId = (raceId: string) => createRaceRecordEntryId(EVENT_ID, raceId);
const stored = (raceId: string, over: Record<string, unknown> = {}): [string, StoredRaceEntry] => [
  entryId(raceId),
  {
    id: entryId(raceId),
    date: "2026-10-24",
    timeSeconds: 48.123,
    note: `Buffalo · ${raceId.split("-")[0] ?? ""}`,
    source: "race",
    ...over,
  },
];
const statusOf = (d: ReturnType<typeof derive>, resultId: string) => d.byResultId.get(resultId)?.status ?? null;

describe("deriveResultSyncInfo: confirmed own rows", () => {
  it("recorded, with the distance, when the entry is there and holds the same values", () => {
    const d = derive({ recorded: new Map([stored("500m-1")]) });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "recorded", recordDistanceId: "500m" });
  });

  it("waiting when the entry is not there yet (offline, or just confirmed)", () => {
    expect(statusOf(derive({ recorded: new Map() }), "500m-1_lindsay")).toEqual({ kind: "waiting" });
  });

  it("waiting, not recorded, when an old entry holds a different time or date", () => {
    const d = derive({ recorded: new Map([stored("500m-1", { timeSeconds: 49.5 })]) });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "waiting" });
    const e = derive({ recorded: new Map([stored("500m-1", { date: "2026-10-25" })]) });
    expect(statusOf(e, "500m-1_lindsay")).toEqual({ kind: "waiting" });
  });

  it("maps Super 1500m to the 1500m record by the plan's own table", () => {
    const d = derive({
      races: [race("super-1", "super_1500m", { label: "Super 1500m" })],
      results: [row("super-1", "lindsay")],
      recorded: new Map([stored("super-1", { note: "Buffalo · Super 1500m" })]),
    });
    expect(statusOf(d, "super-1_lindsay")).toEqual({ kind: "recorded", recordDistanceId: "1500m" });
  });

  it("unmapped distance: not recorded, because the project cannot be matched", () => {
    const d = derive({ races: [race("weird-1", "relay")], results: [row("weird-1", "lindsay")] });
    expect(statusOf(d, "weird-1_lindsay")).toEqual({ kind: "unmapped-distance" });
  });

  it("no date: a race without a day in a multi-day event", () => {
    const d = derive({ races: [race("500m-1", "500m", { day: null })] });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "no-date" });
  });

  it("a race without a day in a one-day event takes the event's day and can be recorded", () => {
    const d = derive({
      event: { ...EVENT, dates: ["2026-10-24"] },
      races: [race("500m-1", "500m", { day: null })],
      recorded: new Map(),
    });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "waiting" });
  });

  it("self row with no athlete: no-athlete, which is the plan's own not-linked reason", () => {
    const unlinked = person("lindsay", { isSelf: true, athleteRefId: null });
    const d = derive({ roster: [unlinked] });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "no-athlete" });
    expect(
      planRaceRecords({
        athleteId: "lindsay",
        sources: {
          events: [
            {
              event: EVENT,
              races: [race("500m-1", "500m")],
              roster: [unlinked],
              results: [row("500m-1", "lindsay")],
              complete: true,
            },
          ],
          eventsComplete: true,
          unknownEventIds: [],
        },
      }).skipped,
    ).toEqual([{ eventId: EVENT_ID, resultId: "500m-1_lindsay", reason: "not-linked" }]);
  });

  it("self row linked to another athlete: a visible wrong-athlete row", () => {
    const d = derive({ athleteId: "mia" });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "wrong-athlete" });
  });

  it("self row no longer on the race's roster: a visible removed-from-race row, the result stays listed", () => {
    const d = derive({ races: [race("500m-1", "500m", { rosterIds: ["ann"] })] });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "removed-from-race" });
    expect(d.unexpected).toEqual([]);
  });

  it("a removed-from-race row is not 'recorded' even when an old entry is still stored", () => {
    const d = derive({
      races: [race("500m-1", "500m", { rosterIds: [] })],
      recorded: new Map([stored("500m-1")]),
    });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "removed-from-race" });
  });

  it("link problems show for a finished confirmed row only: DNS, DNF, DQ and unconfirmed rows stay quiet", () => {
    for (const [roster, athleteId] of [
      [[person("lindsay", { isSelf: true, athleteRefId: null })], "lindsay"],
      [[me], "mia"],
    ] as const) {
      const d = derive({
        roster: [...roster],
        athleteId,
        results: [
          row("500m-1", "lindsay", { status: "DNS", timeSeconds: null }),
          row("1000m-1", "lindsay", pending),
        ],
        races: [race("500m-1", "500m"), race("1000m-1", "1000m")],
      });
      expect(statusOf(d, "500m-1_lindsay")).toBeNull();
      expect(d.byResultId.get("1000m-1_lindsay")).toEqual({ status: null, confirmHint: false });
    }
  });

  it("no-athlete does not depend on the records being read", () => {
    const d = derive({ roster: [person("lindsay", { isSelf: true, athleteRefId: null })], recorded: null });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "no-athlete" });
  });

  it("with several self rows, the first by id is the one", () => {
    const d = derive({
      roster: [person("zed", { isSelf: true, athleteRefId: "lindsay" }), person("amy", { isSelf: true, athleteRefId: null })],
      results: [row("500m-1", "zed"), row("500m-1", "amy")],
    });
    expect(statusOf(d, "500m-1_amy")).toEqual({ kind: "no-athlete" });
    expect(d.byResultId.has("500m-1_zed")).toBe(false);
  });

  it("DNS, DNF and DQ show nothing: they have no time and are never synced", () => {
    for (const status of ["DNS", "DNF", "DQ"] as const) {
      const d = derive({ results: [row("500m-1", "lindsay", { status, timeSeconds: null })] });
      expect(statusOf(d, "500m-1_lindsay")).toBeNull();
      expect(d.unexpected).toEqual([]);
    }
  });

  it("an unreadable time or a missing race shows nothing and is reported for the log", () => {
    const badTime = derive({ results: [row("500m-1", "lindsay", { timeSeconds: null })] });
    expect(statusOf(badTime, "500m-1_lindsay")).toBeNull();
    expect(badTime.unexpected).toEqual([{ resultId: "500m-1_lindsay", reason: "invalid-time" }]);

    const noRace = derive({ races: [], results: [row("gone-1", "lindsay")] });
    expect(statusOf(noRace, "gone-1_lindsay")).toBeNull();
    expect(noRace.unexpected).toEqual([{ resultId: "gone-1_lindsay", reason: "race-missing" }]);
  });

  it("no self row: nothing", () => {
    expect(derive({ roster: [other] }).byResultId.size).toBe(0);
  });
});

describe("deriveResultSyncInfo: rows that are not sync subjects", () => {
  it("other people's rows get no status and no hint", () => {
    const d = derive({
      results: [row("500m-1", "ann", pending), row("500m-1", "ann")],
    });
    expect(d.byResultId.size).toBe(0);
  });

  it("an unconfirmed own row shows no status", () => {
    const d = derive({ results: [row("500m-1", "lindsay", pending)] });
    expect(statusOf(d, "500m-1_lindsay")).toBeNull();
  });
});

describe("deriveResultSyncInfo: records not known", () => {
  it("a row that would be recorded shows nothing, neither recorded nor waiting", () => {
    expect(statusOf(derive({ recorded: null }), "500m-1_lindsay")).toBeNull();
  });

  it("reasons that do not depend on the records are still shown", () => {
    const d = derive({ recorded: null, races: [race("weird-1", "relay")], results: [row("weird-1", "lindsay")] });
    expect(statusOf(d, "weird-1_lindsay")).toEqual({ kind: "unmapped-distance" });
  });
});

describe("deriveResultSyncInfo: records could not be read", () => {
  it("a row that would be recorded says unknown, not nothing", () => {
    const d = derive({ recorded: null, recordsReadFailed: true });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "unknown" });
  });

  it("a failed read wins over entries that were read earlier", () => {
    const d = derive({ recorded: new Map([stored("500m-1")]), recordsReadFailed: true });
    expect(statusOf(d, "500m-1_lindsay")).toEqual({ kind: "unknown" });
  });

  it("still loading (no records, no failure) shows nothing", () => {
    const d = derive({ recorded: null, recordsReadFailed: false });
    expect(statusOf(d, "500m-1_lindsay")).toBeNull();
    expect(statusOf(derive({ recorded: null }), "500m-1_lindsay")).toBeNull();
  });

  it("reasons that do not depend on the records are not replaced by unknown", () => {
    const failed = { recorded: null, recordsReadFailed: true } as const;
    expect(
      statusOf(derive({ ...failed, races: [race("weird-1", "relay")], results: [row("weird-1", "lindsay")] }), "weird-1_lindsay"),
    ).toEqual({ kind: "unmapped-distance" });
    expect(statusOf(derive({ ...failed, races: [race("500m-1", "500m", { day: null })] }), "500m-1_lindsay")).toEqual({
      kind: "no-date",
    });
    expect(
      statusOf(derive({ ...failed, roster: [person("lindsay", { isSelf: true, athleteRefId: null })] }), "500m-1_lindsay"),
    ).toEqual({ kind: "no-athlete" });
    expect(statusOf(derive({ ...failed, athleteId: "mia" }), "500m-1_lindsay")).toEqual({ kind: "wrong-athlete" });
    expect(
      statusOf(derive({ ...failed, races: [race("500m-1", "500m", { rosterIds: ["ann"] })] }), "500m-1_lindsay"),
    ).toEqual({ kind: "removed-from-race" });
  });

  it("an unreadable time or a missing race still shows nothing and is reported for the log", () => {
    const d = derive({ recorded: null, recordsReadFailed: true, results: [row("500m-1", "lindsay", { timeSeconds: null })] });
    expect(statusOf(d, "500m-1_lindsay")).toBeNull();
    expect(d.unexpected).toEqual([{ resultId: "500m-1_lindsay", reason: "invalid-time" }]);
  });

  it("an unconfirmed row still only gives the confirm hint, and DNS stays quiet", () => {
    const d = derive({
      recorded: null,
      recordsReadFailed: true,
      races: [race("500m-1", "500m"), race("1000m-1", "1000m")],
      results: [row("500m-1", "lindsay", pending), row("1000m-1", "lindsay", { status: "DNS", timeSeconds: null })],
    });
    expect(d.byResultId.get("500m-1_lindsay")).toEqual({ status: null, confirmHint: true });
    expect(statusOf(d, "1000m-1_lindsay")).toBeNull();
  });
});

describe("deriveResultSyncInfo: the confirm hint", () => {
  const hint = (d: ReturnType<typeof derive>, resultId: string) => d.byResultId.get(resultId)?.confirmHint ?? false;

  it("shown on an unconfirmed own finished row that confirming would sync", () => {
    expect(hint(derive({ results: [row("500m-1", "lindsay", pending)] }), "500m-1_lindsay")).toBe(true);
  });

  it("not shown when it could not be recorded: unmapped distance, no date, no athlete", () => {
    expect(
      hint(
        derive({ races: [race("weird-1", "relay")], results: [row("weird-1", "lindsay", pending)] }),
        "weird-1_lindsay",
      ),
    ).toBe(false);
    expect(
      hint(
        derive({ races: [race("500m-1", "500m", { day: null })], results: [row("500m-1", "lindsay", pending)] }),
        "500m-1_lindsay",
      ),
    ).toBe(false);
    expect(
      hint(
        derive({
          roster: [person("lindsay", { isSelf: true, athleteRefId: null })],
          results: [row("500m-1", "lindsay", pending)],
        }),
        "500m-1_lindsay",
      ),
    ).toBe(false);
  });

  it("not shown for DNS, DNF, DQ, for other people's rows, or for another athlete's self row", () => {
    expect(
      hint(derive({ results: [row("500m-1", "lindsay", { ...pending, status: "DNS", timeSeconds: null })] }), "500m-1_lindsay"),
    ).toBe(false);
    expect(hint(derive({ results: [row("500m-1", "ann", pending)] }), "500m-1_ann")).toBe(false);
    expect(hint(derive({ athleteId: "mia", results: [row("500m-1", "lindsay", pending)] }), "500m-1_lindsay")).toBe(false);
  });

  it("not shown when the self row was removed from the race's roster: confirming would not record it", () => {
    const d = derive({
      races: [race("500m-1", "500m", { rosterIds: ["ann"] })],
      results: [row("500m-1", "lindsay", pending)],
    });
    expect(d.byResultId.get("500m-1_lindsay")).toEqual({ status: null, confirmHint: false });
  });

  it("not shown on a confirmed row", () => {
    expect(hint(derive(), "500m-1_lindsay")).toBe(false);
  });

  it("is independent of whether the records were read", () => {
    expect(hint(derive({ recorded: null, results: [row("500m-1", "lindsay", pending)] }), "500m-1_lindsay")).toBe(true);
  });
});

describe("deriveResultSyncInfo agrees with what reconcile writes", () => {
  it("every row waiting becomes recorded once reconcile has run, and nothing else changes", () => {
    const races = [
      race("500m-1", "500m"),
      race("1000m-1", "1000m"),
      race("super-1", "super_1500m", { label: "Super 1500m" }),
      race("weird-1", "relay"),
      race("500m-nodate", "500m", { day: null }),
    ];
    const results = [
      row("500m-1", "lindsay"),
      row("1000m-1", "lindsay", { timeSeconds: 95.5 }),
      row("super-1", "lindsay", { timeSeconds: 150.25 }),
      row("weird-1", "lindsay"),
      row("500m-nodate", "lindsay"),
    ];
    const before = derive({ races, results, recorded: new Map() });
    const waiting = [...before.byResultId].filter(([, info]) => info.status?.kind === "waiting").map(([id]) => id);
    expect(waiting.sort()).toEqual(["1000m-1_lindsay", "500m-1_lindsay", "super-1_lindsay"]);

    // Run the real reconcile for each distance document and read the entries back as the page would.
    const plan = planRaceRecords({
      athleteId: "lindsay",
      sources: { events: [{ event: EVENT, races, roster: [me, other], results, complete: true }], eventsComplete: true, unknownEventIds: [] },
    });
    const recorded = new Map<string, StoredRaceEntry>();
    for (const distance of new Set(plan.desired.map((d) => d.recordDistanceId))) {
      const out = reconcileRaceEntries({
        existing: [],
        desired: plan.desired.filter((d) => d.recordDistanceId === distance),
        canRemoveEntriesOf: plan.canRemoveEntriesOf,
        nowIso: NOW,
      });
      for (const entry of out.entries as StoredRaceEntry[]) recorded.set(String(entry.id), entry);
    }

    const after = derive({ races, results, recorded });
    for (const id of waiting) {
      expect(statusOf(after, id)?.kind).toBe("recorded");
    }
    expect(statusOf(after, "weird-1_lindsay")).toEqual({ kind: "unmapped-distance" });
    expect(statusOf(after, "500m-nodate_lindsay")).toEqual({ kind: "no-date" });
    expect(statusOf(after, "super-1_lindsay")).toEqual({ kind: "recorded", recordDistanceId: "1500m" });
  });

  it("an edit that changes the time is waiting until reconcile updates the stored entry", () => {
    const first = [row("500m-1", "lindsay", { timeSeconds: 50 })];
    const plan1 = planRaceRecords({
      athleteId: "lindsay",
      sources: { events: [{ event: EVENT, races: [race("500m-1", "500m")], roster: [me], results: first, complete: true }], eventsComplete: true, unknownEventIds: [] },
    });
    const written = reconcileRaceEntries({ existing: [], desired: plan1.desired, canRemoveEntriesOf: plan1.canRemoveEntriesOf, nowIso: NOW });
    const recorded = new Map((written.entries as StoredRaceEntry[]).map((e) => [String(e.id), e]));

    expect(statusOf(derive({ results: first, recorded }), "500m-1_lindsay")?.kind).toBe("recorded");
    // Edited and confirmed again at a faster time, offline: the stored entry is still the old one.
    const edited = [row("500m-1", "lindsay", { timeSeconds: 47.9 })];
    expect(statusOf(derive({ results: edited, recorded }), "500m-1_lindsay")).toEqual({ kind: "waiting" });
  });
});
