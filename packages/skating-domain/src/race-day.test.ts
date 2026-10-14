import type {
  RaceDayProvenance,
  RaceEntry,
  RaceResult,
} from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import {
  buildRaceSummary,
  countByVerification,
  createPendingProvenance,
  createRaceResultId,
  groupRaceEntriesByDay,
  isConfirmed,
  isValidRaceDayId,
  markPending,
  markVerified,
  RACE_SUMMARY_VERSION,
  sortRaceEntries,
  validateRaceResultInput,
} from "./race-day";

// Fixtures use obviously fake names. No real athlete data belongs in tests.

const NOW = "2026-01-02T03:04:05.000Z";

function race(partial: Partial<RaceEntry> & Pick<RaceEntry, "raceId">): RaceEntry {
  return {
    schemaVersion: 1,
    distanceId: "500m",
    label: "500m",
    sortOrder: 0,
    day: null,
    round: null,
    heat: null,
    scheduledAt: null,
    rosterIds: ["self"],
    ...createPendingProvenance("test fixture"),
    ...partial,
  };
}

function result(
  partial: Partial<RaceResult> & Pick<RaceResult, "raceId">,
): RaceResult {
  return {
    schemaVersion: 1,
    rosterId: "self",
    resultId: `${partial.raceId}_self`,
    status: "finished",
    timeSeconds: 50,
    place: null,
    advanced: null,
    ...createPendingProvenance("test fixture"),
    ...partial,
  };
}

describe("ids", () => {
  it.each(["buffalo-2026", "r1", "a", "500m-final"])("accepts %j", (id) => {
    expect(isValidRaceDayId(id)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["uppercase", "Buffalo"],
    ["underscore (reserved as separator)", "a_b"],
    ["slash", "a/b"],
    ["leading hyphen", "-a"],
    ["trailing hyphen", "a-"],
    ["double hyphen", "a--b"],
    ["space", "a b"],
    ["too long", "a".repeat(65)],
  ])("rejects %s", (_label, id) => {
    expect(isValidRaceDayId(id)).toBe(false);
  });

  it("builds a deterministic result id that can be split back unambiguously", () => {
    const id = createRaceResultId("race-500m-1", "self");
    expect(id).toBe("race-500m-1_self");
    expect(createRaceResultId("race-500m-1", "self")).toBe(id);
    expect(id.split("_")).toEqual(["race-500m-1", "self"]);
  });

  it("refuses to build an id from invalid parts", () => {
    expect(() => createRaceResultId("a_b", "self")).toThrow();
    expect(() => createRaceResultId("race", "")).toThrow();
  });
});

describe("provenance (待确认)", () => {
  it("always starts pending and cannot be created verified", () => {
    const p = createPendingProvenance("  roster pdf  ");
    expect(p).toEqual({
      verification: "pending",
      source: "manual",
      sourceNote: "roster pdf",
      verifiedAt: null,
    });
    expect(isConfirmed(p)).toBe(false);
  });

  it("marks verified with a timestamp, without mutating the input", () => {
    const pending = createPendingProvenance("x");
    const verified = markVerified(pending, NOW);
    expect(verified.verification).toBe("verified");
    expect(verified.verifiedAt).toBe(NOW);
    expect(isConfirmed(verified)).toBe(true);
    expect(pending.verification).toBe("pending");
    expect(pending.verifiedAt).toBeNull();
  });

  it("returns to pending, clearing verifiedAt, when a verified value is edited", () => {
    const back = markPending(markVerified(createPendingProvenance("x"), NOW));
    expect(back.verification).toBe("pending");
    expect(back.verifiedAt).toBeNull();
  });

  it("counts pending and verified items", () => {
    const items: RaceDayProvenance[] = [
      createPendingProvenance("a"),
      markVerified(createPendingProvenance("b"), NOW),
      createPendingProvenance("c"),
    ];
    expect(countByVerification(items)).toEqual({ pending: 2, verified: 1 });
    expect(countByVerification([])).toEqual({ pending: 0, verified: 0 });
  });
});

describe("validateRaceResultInput", () => {
  const ok = { place: null, advanced: null };

  it("accepts a finished race with a valid time", () => {
    expect(
      validateRaceResultInput({ status: "finished", timeSeconds: 49.8, ...ok }),
    ).toEqual([]);
    expect(
      validateRaceResultInput({
        status: "finished",
        timeSeconds: 104.23,
        place: 2,
        advanced: true,
      }),
    ).toEqual([]);
  });

  it("requires a time when finished", () => {
    expect(
      validateRaceResultInput({ status: "finished", timeSeconds: null, ...ok }),
    ).toEqual(["timeRequired"]);
  });

  it.each([[0], [-1], [Number.NaN], [1801]])(
    "rejects finished time %d",
    (timeSeconds) => {
      expect(
        validateRaceResultInput({ status: "finished", timeSeconds, ...ok }),
      ).toEqual(["timeInvalid"]);
    },
  );

  it.each([[0], [-2], [1.5]])("rejects place %d", (place) => {
    expect(
      validateRaceResultInput({
        status: "finished",
        timeSeconds: 50,
        place,
        advanced: null,
      }),
    ).toEqual(["placeInvalid"]);
  });

  it.each(["DNS", "DNF", "DQ"] as const)(
    "accepts %s without time, place or advancement",
    (status) => {
      expect(
        validateRaceResultInput({
          status,
          timeSeconds: null,
          place: null,
          advanced: null,
        }),
      ).toEqual([]);
      expect(
        validateRaceResultInput({
          status,
          timeSeconds: null,
          place: null,
          advanced: false,
        }),
      ).toEqual([]);
    },
  );

  it.each(["DNS", "DNF", "DQ"] as const)(
    "rejects a time, place or advancement on %s",
    (status) => {
      expect(
        validateRaceResultInput({
          status,
          timeSeconds: 50,
          place: 1,
          advanced: true,
        }),
      ).toEqual(["timeNotAllowed", "placeNotAllowed", "advancedNotAllowed"]);
    },
  );
});

describe("schedule ordering", () => {
  it("keeps two untimed same-distance races in entry order via sortOrder", () => {
    const sorted = sortRaceEntries([
      race({ raceId: "r-second", label: "500m", sortOrder: 2 }),
      race({ raceId: "r-first", label: "500m", sortOrder: 1 }),
    ]);
    expect(sorted.map((r) => r.raceId)).toEqual(["r-first", "r-second"]);
  });

  it("sorts known day and time first, unknown last", () => {
    const sorted = sortRaceEntries([
      race({ raceId: "unknown" }),
      race({ raceId: "day2", day: "2026-10-25" }),
      race({
        raceId: "day1-late",
        day: "2026-10-24",
        scheduledAt: "2026-10-24T15:00:00.000Z",
      }),
      race({
        raceId: "day1-early",
        day: "2026-10-24",
        scheduledAt: "2026-10-24T13:00:00.000Z",
      }),
      race({ raceId: "day1-notime", day: "2026-10-24" }),
    ]);
    expect(sorted.map((r) => r.raceId)).toEqual([
      "day1-early",
      "day1-late",
      "day1-notime",
      "day2",
      "unknown",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [race({ raceId: "b", sortOrder: 2 }), race({ raceId: "a", sortOrder: 1 })];
    sortRaceEntries(input);
    expect(input.map((r) => r.raceId)).toEqual(["b", "a"]);
  });

  it("groups by day and keeps unknown days in their own group at the end", () => {
    const groups = groupRaceEntriesByDay([
      race({ raceId: "u1" }),
      race({ raceId: "d2", day: "2026-10-25" }),
      race({ raceId: "d1a", day: "2026-10-24", sortOrder: 1 }),
      race({ raceId: "d1b", day: "2026-10-24", sortOrder: 2 }),
    ]);
    expect(groups.map((g) => [g.day, g.races.map((r) => r.raceId)])).toEqual([
      ["2026-10-24", ["d1a", "d1b"]],
      ["2026-10-25", ["d2"]],
      [null, ["u1"]],
    ]);
  });

  it("returns no groups for no races", () => {
    expect(groupRaceEntriesByDay([])).toEqual([]);
  });
});

describe("buildRaceSummary", () => {
  const self = { rosterId: "self", displayName: "Test Skater", bib: "000", division: "Test Division" };
  const races = [
    race({ raceId: "a", label: "500m", distanceId: "500m", sortOrder: 1 }),
    race({ raceId: "b", label: "500m", distanceId: "500m", sortOrder: 2 }),
    race({ raceId: "c", label: "1000m", distanceId: "1000m", sortOrder: 3 }),
    race({ raceId: "other", label: "500m", sortOrder: 4, rosterIds: ["someone-else"] }),
  ];

  it("reports the algorithm version", () => {
    expect(buildRaceSummary({ self, races, results: [] }).summaryVersion).toBe(
      RACE_SUMMARY_VERSION,
    );
  });

  it("handles the empty state: no results yet", () => {
    const summary = buildRaceSummary({ self, races, results: [] });
    expect(summary.racesTotal).toBe(3);
    expect(summary.racesWithResult).toBe(0);
    expect(summary.racesFinished).toBe(0);
    expect(summary.pendingResultCount).toBe(0);
    expect(summary.fastestConfirmedSeconds).toBeNull();
    expect(summary.items.every((i) => i.status === null && !i.confirmed)).toBe(true);
  });

  it("only includes races the athlete is entered in", () => {
    const summary = buildRaceSummary({ self, races, results: [] });
    expect(summary.items.map((i) => i.raceId)).toEqual(["a", "b", "c"]);
  });

  it("never treats pending results as confirmed, and counts them", () => {
    const summary = buildRaceSummary({
      self,
      races,
      results: [
        result({ raceId: "a", timeSeconds: 50.1 }),
        result({ raceId: "b", timeSeconds: 49.8 }),
      ],
    });
    expect(summary.pendingResultCount).toBe(2);
    expect(summary.fastestConfirmedSeconds).toBeNull();
    expect(summary.items.filter((i) => i.confirmed)).toHaveLength(0);
  });

  it("takes the fastest time among confirmed results only", () => {
    const summary = buildRaceSummary({
      self,
      races,
      results: [
        // Fastest overall is pending, so it must not count.
        result({ raceId: "a", timeSeconds: 48.0 }),
        markVerified(result({ raceId: "b", timeSeconds: 49.8 }), NOW),
        markVerified(result({ raceId: "c", timeSeconds: 104.23 }), NOW),
      ],
    });
    expect(summary.fastestConfirmedSeconds).toBe(49.8);
    expect(summary.pendingResultCount).toBe(1);
    expect(summary.racesWithResult).toBe(3);
  });

  it("excludes DNS/DNF/DQ from finished counts and from the fastest time", () => {
    const summary = buildRaceSummary({
      self,
      races,
      results: [
        markVerified(
          result({ raceId: "a", status: "DNF", timeSeconds: null }),
          NOW,
        ),
        markVerified(result({ raceId: "b", timeSeconds: 50 }), NOW),
      ],
    });
    expect(summary.racesFinished).toBe(1);
    expect(summary.racesWithResult).toBe(2);
    expect(summary.fastestConfirmedSeconds).toBe(50);
  });

  it("ignores results that belong to another athlete", () => {
    const summary = buildRaceSummary({
      self,
      races,
      results: [result({ raceId: "a", rosterId: "someone-else", timeSeconds: 40 })],
    });
    expect(summary.racesWithResult).toBe(0);
  });

  it("computes the delta to a personal best only for finished races with a known PB", () => {
    const summary = buildRaceSummary({
      self,
      races,
      results: [
        result({ raceId: "a", timeSeconds: 50.1 }),
        result({ raceId: "b", status: "DQ", timeSeconds: null }),
        result({ raceId: "c", timeSeconds: 105 }),
      ],
      personalBestSecondsByDistanceId: { "500m": 49.8 },
    });
    const byId = Object.fromEntries(summary.items.map((i) => [i.raceId, i]));
    expect(byId.a?.deltaToPersonalBestSeconds).toBe(0.3);
    expect(byId.b?.deltaToPersonalBestSeconds).toBeNull();
    expect(byId.c?.deltaToPersonalBestSeconds).toBeNull();
  });

  it("does not mutate its inputs", () => {
    const input = { self, races: [...races], results: [result({ raceId: "a" })] };
    const before = JSON.stringify(input);
    buildRaceSummary(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
