import type { RaceEntry, RaceResult } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import { buildTodayView, eventPhase, RACE_DAY_TODAY_VERSION } from "./race-day-today";

const prov = {
  verification: "pending" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1 as const,
};
const NY = "America/New_York";
const event = { dates: ["2026-10-24", "2026-10-25"], timeZone: NY as string | null };

const race = (raceId: string, over: Partial<RaceEntry> = {}): RaceEntry => ({
  raceId,
  distanceId: "500m",
  label: raceId,
  sortOrder: 0,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: ["me"],
  ...prov,
  ...over,
});
const result = (raceId: string, rosterId: string, over: Partial<RaceResult> = {}): RaceResult => ({
  resultId: `${raceId}_${rosterId}`,
  raceId,
  rosterId,
  status: "finished",
  timeSeconds: 50,
  place: null,
  advanced: null,
  ...prov,
  ...over,
});
const me = { rosterId: "me" };

// 2026-10-24 12:00 in New York (EDT, UTC-4)
const SAT_NOON = "2026-10-24T16:00:00.000Z";

describe("eventPhase", () => {
  it("is 'today' on an event day, judged in the event's zone", () => {
    expect(eventPhase(event, SAT_NOON)).toEqual({ kind: "today", today: "2026-10-24" });
  });

  it("uses the event's zone, not UTC: 23:30 on Oct 23 in New York is still the day before", () => {
    // 2026-10-24T03:30Z is Oct 23 23:30 in New York, but already Oct 24 in UTC.
    const phase = eventPhase(event, "2026-10-24T03:30:00.000Z");
    expect(phase).toEqual({ kind: "before", today: "2026-10-23", firstDay: "2026-10-24", daysUntil: 1 });
  });

  it("the day rolls over at local midnight of the event's zone", () => {
    expect(eventPhase(event, "2026-10-24T04:00:00.000Z")).toMatchObject({ kind: "today", today: "2026-10-24" });
    expect(eventPhase(event, "2026-10-26T03:59:00.000Z")).toMatchObject({ kind: "today", today: "2026-10-25" });
    expect(eventPhase(event, "2026-10-26T04:00:00.000Z")).toMatchObject({ kind: "after", today: "2026-10-26" });
  });

  it("counts whole calendar days before the event", () => {
    expect(eventPhase(event, "2026-10-16T12:00:00.000Z")).toEqual({
      kind: "before",
      today: "2026-10-16",
      firstDay: "2026-10-24",
      daysUntil: 8,
    });
  });

  it("is 'after' once the last day has passed", () => {
    expect(eventPhase(event, "2026-11-02T12:00:00.000Z")).toEqual({
      kind: "after",
      today: "2026-11-02",
      lastDay: "2026-10-25",
    });
  });

  it("is 'between' on a gap day, pointing at the next event day", () => {
    const gap = { dates: ["2026-10-24", "2026-10-26"], timeZone: NY };
    expect(eventPhase(gap, "2026-10-25T16:00:00.000Z")).toEqual({
      kind: "between",
      today: "2026-10-25",
      nextDay: "2026-10-26",
    });
  });

  it("ignores the order and duplicates of the event's dates", () => {
    const messy = { dates: ["2026-10-25", "2026-10-24", "2026-10-24"], timeZone: NY };
    expect(eventPhase(messy, "2026-10-16T12:00:00.000Z")).toMatchObject({ kind: "before", firstDay: "2026-10-24" });
  });

  describe("dates that are not real calendar days", () => {
    // "2026-02-30" sorts before every real October day and "2026-13-99" after, so they would be the
    // first and last day if they were not dropped.
    const dirty = { dates: ["2026-13-99", "2026-10-24", "2026-02-30", "2026-10-25"], timeZone: NY };

    it("never become the first day, and daysUntil counts from the real first day", () => {
      expect(eventPhase(dirty, "2026-10-16T12:00:00.000Z")).toEqual({
        kind: "before",
        today: "2026-10-16",
        firstDay: "2026-10-24",
        daysUntil: 8,
      });
    });

    it("never become the last day", () => {
      expect(eventPhase(dirty, "2026-11-02T12:00:00.000Z")).toEqual({
        kind: "after",
        today: "2026-11-02",
        lastDay: "2026-10-25",
      });
    });

    it("never become the next day", () => {
      const gap = { dates: ["2026-02-30", "2026-10-24", "2026-10-26", "2026-13-99"], timeZone: NY };
      expect(eventPhase(gap, "2026-10-25T16:00:00.000Z")).toEqual({
        kind: "between",
        today: "2026-10-25",
        nextDay: "2026-10-26",
      });
    });

    it("still find today among the real days", () => {
      expect(eventPhase(dirty, SAT_NOON)).toEqual({ kind: "today", today: "2026-10-24" });
    });

    it("leave nothing to go on when every date is dirty", () => {
      expect(eventPhase({ dates: ["2026-02-30", "2026-13-99", "soon"], timeZone: NY }, SAT_NOON)).toEqual({
        kind: "undetermined",
        reason: "noDates",
      });
    });

    it("do not turn a day before an all-dirty event into a view", () => {
      const view = buildTodayView({
        event: { dates: ["2026-02-30"], timeZone: NY },
        races: [],
        results: [],
        self: null,
        now: SAT_NOON,
      });
      expect(view.phase).toEqual({ kind: "undetermined", reason: "noDates" });
      expect(view.shownDay).toBeNull();
    });
  });

  it("does not guess when the zone, dates or clock are unusable", () => {
    expect(eventPhase({ ...event, timeZone: null }, SAT_NOON)).toEqual({ kind: "undetermined", reason: "noTimeZone" });
    expect(eventPhase({ ...event, timeZone: "Not/AZone" }, SAT_NOON)).toEqual({
      kind: "undetermined",
      reason: "badTimeZone",
    });
    expect(eventPhase({ dates: [], timeZone: NY }, SAT_NOON)).toEqual({ kind: "undetermined", reason: "noDates" });
    expect(eventPhase(event, "not a time")).toEqual({ kind: "undetermined", reason: "badClock" });
  });

  it("handles the clock change (Nov 1, 2026 in New York)", () => {
    const fall = { dates: ["2026-11-01"], timeZone: NY };
    // 05:30Z is 01:30 EDT on Nov 1; 06:30Z is 01:30 EST on Nov 1 again.
    expect(eventPhase(fall, "2026-11-01T05:30:00.000Z")).toMatchObject({ kind: "today" });
    expect(eventPhase(fall, "2026-11-01T06:30:00.000Z")).toMatchObject({ kind: "today" });
    expect(eventPhase(fall, "2026-11-02T04:59:00.000Z")).toMatchObject({ kind: "today" });
    expect(eventPhase(fall, "2026-11-02T05:00:00.000Z")).toMatchObject({ kind: "after" });
  });
});

describe("buildTodayView", () => {
  it("carries its version", () => {
    expect(buildTodayView({ event, races: [], results: [], self: null, now: SAT_NOON }).version).toBe(
      RACE_DAY_TODAY_VERSION,
    );
  });

  it("lists only today's races, in schedule order, numbered as in the whole schedule", () => {
    const races = [
      race("r3", { day: "2026-10-25", sortOrder: 3 }),
      race("r2", { sortOrder: 2 }),
      race("r1", { sortOrder: 1 }),
    ];
    const view = buildTodayView({ event, races, results: [], self: me, now: SAT_NOON });
    expect(view.shownDay).toBe("2026-10-24");
    expect(view.races.map((r) => [r.race.raceId, r.number])).toEqual([
      ["r1", 1],
      ["r2", 2],
    ]);
  });

  it("before the event it previews the first day; between days, the next day", () => {
    const races = [race("a"), race("b", { day: "2026-10-25" })];
    const before = buildTodayView({ event, races, results: [], self: me, now: "2026-10-16T12:00:00.000Z" });
    expect(before.shownDay).toBe("2026-10-24");
    expect(before.races.map((r) => r.race.raceId)).toEqual(["a"]);

    const gap = { dates: ["2026-10-24", "2026-10-26"], timeZone: NY };
    const between = buildTodayView({
      event: gap,
      races: [race("a"), race("b", { day: "2026-10-26" })],
      results: [],
      self: me,
      now: "2026-10-25T16:00:00.000Z",
    });
    expect(between.shownDay).toBe("2026-10-26");
    expect(between.races.map((r) => r.race.raceId)).toEqual(["b"]);
  });

  it("after the event, or with 'today' undetermined, no day is shown and the next race is none", () => {
    const races = [race("a")];
    for (const e of [event, { ...event, timeZone: null }]) {
      const view = buildTodayView({
        event: e,
        races,
        results: [],
        self: me,
        now: e.timeZone ? "2026-11-02T12:00:00.000Z" : SAT_NOON,
      });
      expect(view.shownDay).toBeNull();
      expect(view.races).toEqual([]);
      expect(view.next).toEqual({ kind: "noRaces" });
    }
  });

  it("the next race is the first one of the own athlete without a result, not decided by the clock", () => {
    const races = [
      race("r1", { sortOrder: 1, scheduledAt: "2026-10-24T13:00:00.000Z" }),
      race("r2", { sortOrder: 2, scheduledAt: "2026-10-24T14:00:00.000Z" }),
      race("r3", { sortOrder: 3, scheduledAt: "2026-10-24T15:00:00.000Z" }),
    ];
    const view = buildTodayView({
      event,
      races,
      results: [result("r1", "me")],
      self: me,
      // Long after every scheduled time; r2 is still next because it has no result.
      now: "2026-10-24T23:00:00.000Z",
    });
    expect(view.next).toEqual({ kind: "race", raceId: "r2" });
    expect(view.races.map((r) => r.hasResult)).toEqual([true, false, false]);
  });

  it("skips races the own athlete is not on, and ignores other athletes' results", () => {
    const races = [
      race("r1", { sortOrder: 1, rosterIds: ["other"] }),
      race("r2", { sortOrder: 2, rosterIds: ["me", "other"] }),
    ];
    const view = buildTodayView({
      event,
      races,
      results: [result("r2", "other")],
      self: me,
      now: SAT_NOON,
    });
    expect(view.next).toEqual({ kind: "race", raceId: "r2" });
    expect(view.races.map((r) => r.involvesSelf)).toEqual([false, true]);
    expect(view.races[1]?.hasResult).toBe(false);
  });

  it("reports allDone, noRaces and noneForSelf", () => {
    const done = buildTodayView({
      event,
      races: [race("r1")],
      results: [result("r1", "me", { status: "DNF", timeSeconds: null })],
      self: me,
      now: SAT_NOON,
    });
    expect(done.next).toEqual({ kind: "allDone" });

    const none = buildTodayView({ event, races: [], results: [], self: me, now: SAT_NOON });
    expect(none.next).toEqual({ kind: "noRaces" });

    const notMine = buildTodayView({
      event,
      races: [race("r1", { rosterIds: ["other"] })],
      results: [],
      self: me,
      now: SAT_NOON,
    });
    expect(notMine.next).toEqual({ kind: "noneForSelf" });
  });

  it("with no own athlete, every race counts and any result marks a race done", () => {
    const races = [race("r1", { sortOrder: 1, rosterIds: ["a"] }), race("r2", { sortOrder: 2, rosterIds: ["b"] })];
    const view = buildTodayView({
      event,
      races,
      results: [result("r1", "a")],
      self: null,
      now: SAT_NOON,
    });
    expect(view.scope).toBe("all");
    expect(view.next).toEqual({ kind: "race", raceId: "r2" });
    expect(view.races.every((r) => !r.involvesSelf)).toBe(true);
  });

  it("counts pending results: the own athlete's only, or everyone's with no own athlete", () => {
    const races = [race("r1"), race("r2", { sortOrder: 1, rosterIds: ["me", "other"] })];
    const results = [
      result("r1", "me"),
      result("r2", "me", { verification: "verified" }),
      result("r2", "other"),
    ];
    expect(buildTodayView({ event, races, results, self: me, now: SAT_NOON }).pendingResultCount).toBe(1);
    expect(buildTodayView({ event, races, results, self: null, now: SAT_NOON }).pendingResultCount).toBe(2);
  });

  it("ignores results of races that no longer exist", () => {
    const view = buildTodayView({
      event,
      races: [race("r1")],
      results: [result("gone", "me")],
      self: me,
      now: SAT_NOON,
    });
    expect(view.pendingResultCount).toBe(0);
  });

  it("counts races with no day instead of placing them on a day", () => {
    const view = buildTodayView({
      event,
      races: [race("r1"), race("u1", { day: null }), race("u2", { day: null })],
      results: [],
      self: me,
      now: SAT_NOON,
    });
    expect(view.undatedRaceCount).toBe(2);
    expect(view.races.map((r) => r.race.raceId)).toEqual(["r1"]);
  });

  it("does not modify its input", () => {
    const races = [race("b", { sortOrder: 2 }), race("a", { sortOrder: 1 })];
    const copy = JSON.stringify(races);
    buildTodayView({ event, races, results: [], self: me, now: SAT_NOON });
    expect(JSON.stringify(races)).toBe(copy);
  });
});

describe("buildTodayView pendingResultCount follows the shown day's list", () => {
  const SUN_NOON = "2026-10-25T16:00:00.000Z";
  const BEFORE = "2026-10-20T16:00:00.000Z";
  const AFTER = "2026-10-27T16:00:00.000Z";

  // Day 1: one pending result of mine. Day 2: two pending results of mine. One more of someone else
  // on each day, and a confirmed one of mine, so the self/all and the confirmed rules stay visible.
  const races = [
    race("d1", { day: "2026-10-24", sortOrder: 0, rosterIds: ["me", "other"] }),
    race("d2a", { day: "2026-10-25", sortOrder: 1, rosterIds: ["me", "other"] }),
    race("d2b", { day: "2026-10-25", sortOrder: 2, rosterIds: ["me", "other"] }),
  ];
  const results = [
    result("d1", "me"),
    result("d1", "other"),
    result("d2a", "me"),
    result("d2a", "other"),
    result("d2b", "me"),
    result("d2b", "me", { resultId: "d2b_me_done", verification: "verified" }),
    result("d2b", "other"),
  ];
  const count = (now: string, self: { rosterId: string } | null, over: { races?: RaceEntry[]; results?: RaceResult[] } = {}) =>
    buildTodayView({ event, races: over.races ?? races, results: over.results ?? results, self, now }).pendingResultCount;

  it("a multi-day event counts only the shown day: 1 on day 1, 2 on day 2", () => {
    expect(count(SAT_NOON, me)).toBe(1);
    expect(count(SUN_NOON, me)).toBe(2);
  });

  it("before the event, the first day is the shown day and the later days do not leak in", () => {
    const view = buildTodayView({ event, races, results, self: me, now: BEFORE });
    expect(view.shownDay).toBe("2026-10-24");
    expect(view.pendingResultCount).toBe(1);
  });

  it("the own-athlete rule is unchanged: own rows only, and with no own athlete everyone's", () => {
    expect(count(SAT_NOON, me)).toBe(1);
    expect(count(SAT_NOON, null)).toBe(2); // day 1: mine and the other's
    expect(count(SUN_NOON, me)).toBe(2);
    expect(count(SUN_NOON, null)).toBe(4); // day 2: d2a mine and other, d2b mine and other; the confirmed row is out
  });

  it("is 0 once the event is over, when no day is shown", () => {
    const view = buildTodayView({ event, races, results, self: me, now: AFTER });
    expect(view.phase.kind).toBe("after");
    expect(view.shownDay).toBeNull();
    expect(view.pendingResultCount).toBe(0);
  });

  it("is 0 when today cannot be decided", () => {
    const view = buildTodayView({ event: { ...event, timeZone: null }, races, results, self: me, now: SAT_NOON });
    expect(view.shownDay).toBeNull();
    expect(view.pendingResultCount).toBe(0);
  });

  it("a pending result of a race with no day is not counted, and undatedRaceCount is unchanged", () => {
    const withUndated = [...races, race("u1", { day: null, sortOrder: 3 })];
    const withResult = [...results, result("u1", "me")];
    const view = buildTodayView({ event, races: withUndated, results: withResult, self: me, now: SAT_NOON });
    expect(view.pendingResultCount).toBe(1);
    expect(view.undatedRaceCount).toBe(1);
  });

  it("a pending result of a race on a day outside the shown one is not counted, whatever that day is", () => {
    const stray = [...races, race("x1", { day: "2026-11-30", sortOrder: 3 })];
    expect(count(SAT_NOON, me, { races: stray, results: [...results, result("x1", "me")] })).toBe(1);
  });

  it("the other fields do not move with the count", () => {
    const day1 = buildTodayView({ event, races, results, self: me, now: SAT_NOON });
    expect(day1.races.map((r) => r.race.raceId)).toEqual(["d1"]);
    expect(day1.next).toEqual({ kind: "allDone" });
    expect(day1.undatedRaceCount).toBe(0);
    expect(day1.phase).toEqual({ kind: "today", today: "2026-10-24" });
    expect(day1.version).toBe(RACE_DAY_TODAY_VERSION);
  });
});
