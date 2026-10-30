import type { RaceEntry, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import { ownRosterEntry, pickNextAndPreviousEvents, recentOwnResults } from "./race-day-overview";

const NY = "America/New_York";
const ev = (eventId: string, dates: string[], timeZone: string | null = NY) => ({ eventId, dates, timeZone });
const ids = (picks: ReturnType<typeof pickNextAndPreviousEvents>) => ({
  next: picks.next?.event.eventId ?? null,
  previous: picks.previous?.event.eventId ?? null,
});

// 2026-10-30 12:00 in New York (EDT)
const NOW = "2026-10-30T16:00:00.000Z";
const DEVICE = "2026-10-30";

describe("pickNextAndPreviousEvents", () => {
  it("has nothing to show without events", () => {
    expect(pickNextAndPreviousEvents([], NOW, DEVICE)).toEqual({ next: null, previous: null });
  });

  it("the Buffalo event (last day Oct 25) is the previous one on Oct 30, and there is no next one", () => {
    const picks = pickNextAndPreviousEvents([ev("buffalo", ["2026-10-24", "2026-10-25"])], NOW, DEVICE);
    expect(picks.next).toBeNull();
    expect(picks.previous).toMatchObject({
      firstDay: "2026-10-24",
      lastDay: "2026-10-25",
      status: "past",
      zoneKnown: true,
      daysUntil: null,
    });
  });

  it("next is the upcoming event that starts first; previous is the finished one that ended last", () => {
    const picks = pickNextAndPreviousEvents(
      [
        ev("late", ["2026-12-05"]),
        ev("soon", ["2026-11-07", "2026-11-08"]),
        ev("old", ["2026-09-01"]),
        ev("recent", ["2026-10-25"]),
      ],
      NOW,
      DEVICE,
    );
    expect(ids(picks)).toEqual({ next: "soon", previous: "recent" });
  });

  it("an event that is under way counts as the next one, with no countdown", () => {
    const picks = pickNextAndPreviousEvents(
      [ev("now", ["2026-10-29", "2026-10-31"]), ev("later", ["2026-11-20"])],
      NOW,
      DEVICE,
    );
    expect(picks.next).toMatchObject({ event: { eventId: "now" }, status: "ongoing", daysUntil: null });
  });

  it("the last day itself still counts as under way", () => {
    const picks = pickNextAndPreviousEvents([ev("today", ["2026-10-30"])], NOW, DEVICE);
    expect(picks.next).toMatchObject({ status: "ongoing" });
    expect(picks.previous).toBeNull();
  });

  it("a gap day inside the event's span is still under way", () => {
    const picks = pickNextAndPreviousEvents([ev("gap", ["2026-10-28", "2026-11-01"])], NOW, DEVICE);
    expect(picks.next).toMatchObject({ status: "ongoing" });
  });

  it("ties on the first day go to the smaller eventId, and so do ties on the last day", () => {
    const upcoming = pickNextAndPreviousEvents(
      [ev("b-event", ["2026-11-07"]), ev("a-event", ["2026-11-07", "2026-11-09"])],
      NOW,
      DEVICE,
    );
    expect(upcoming.next?.event.eventId).toBe("a-event");

    const over = pickNextAndPreviousEvents(
      [ev("b-event", ["2026-10-20"]), ev("a-event", ["2026-10-18", "2026-10-20"])],
      NOW,
      DEVICE,
    );
    expect(over.previous?.event.eventId).toBe("a-event");
  });

  it("the input order does not change the answer", () => {
    const events = [ev("x", ["2026-11-07"]), ev("y", ["2026-11-07"]), ev("z", ["2026-10-01"])];
    const forward = pickNextAndPreviousEvents(events, NOW, DEVICE);
    const backward = pickNextAndPreviousEvents([...events].reverse(), NOW, DEVICE);
    expect(ids(forward)).toEqual(ids(backward));
  });

  it("drops malformed dates itself, and an event with none left takes no part", () => {
    const picks = pickNextAndPreviousEvents(
      [
        ev("no-valid-day", ["soon", "2026-13-01", "2026-02-31", ""]),
        ev("empty", []),
        ev("mixed", ["tbd", "2026-11-07", "2026-11-08", "11/09/2026"]),
      ],
      NOW,
      DEVICE,
    );
    expect(picks.next).toMatchObject({ event: { eventId: "mixed" }, firstDay: "2026-11-07", lastDay: "2026-11-08" });
    expect(picks.previous).toBeNull();
  });

  it("a bad date cannot become the first or last day of an event", () => {
    const picks = pickNextAndPreviousEvents([ev("e", ["0000-00-00", "9999-99-99", "2026-10-01"])], NOW, DEVICE);
    expect(picks.previous).toMatchObject({ firstDay: "2026-10-01", lastDay: "2026-10-01" });
  });

  describe("time zones", () => {
    it("counts whole days to the start in the event's zone", () => {
      const picks = pickNextAndPreviousEvents([ev("e", ["2026-11-07"])], NOW, DEVICE);
      expect(picks.next).toMatchObject({ status: "upcoming", zoneKnown: true, daysUntil: 8 });
    });

    it("judges 'today' in the event's zone, not the device's", () => {
      // Oct 24 03:30 UTC is still Oct 23 in New York; a device already on Oct 24 must not decide.
      const picks = pickNextAndPreviousEvents([ev("e", ["2026-10-24"])], "2026-10-24T03:30:00.000Z", "2026-10-24");
      expect(picks.next).toMatchObject({ status: "upcoming", zoneKnown: true, daysUntil: 1 });
    });

    it("a zone-less event is compared on the device's day, with no countdown and a flag", () => {
      const picks = pickNextAndPreviousEvents([ev("e", ["2026-11-07"], null)], NOW, DEVICE);
      expect(picks.next).toMatchObject({ status: "upcoming", zoneKnown: false, daysUntil: null });
    });

    it("the device's day decides the zone-less event, in either direction", () => {
      const event = ev("e", ["2026-10-30"], null);
      expect(pickNextAndPreviousEvents([event], NOW, "2026-10-30").next).toMatchObject({ status: "ongoing" });
      expect(pickNextAndPreviousEvents([event], NOW, "2026-10-31").previous).toMatchObject({ status: "past" });
    });

    it("a zone that is not a real zone is treated like an unknown one", () => {
      const picks = pickNextAndPreviousEvents([ev("e", ["2026-11-07"], "Mars/Olympus")], NOW, DEVICE);
      expect(picks.next).toMatchObject({ zoneKnown: false, daysUntil: null });
    });

    it("each event is judged in its own zone", () => {
      // 2026-11-01T02:30Z is Oct 31 in New York but already Nov 1 in Tokyo.
      const now = "2026-11-01T02:30:00.000Z";
      const picks = pickNextAndPreviousEvents(
        [ev("ny", ["2026-10-31"], NY), ev("tokyo", ["2026-10-31"], "Asia/Tokyo")],
        now,
        "2026-11-01",
      );
      expect(picks.next?.event.eventId).toBe("ny");
      expect(picks.previous?.event.eventId).toBe("tokyo");
    });

    it("an unreadable clock falls back to the device's day", () => {
      const picks = pickNextAndPreviousEvents([ev("e", ["2026-11-07"])], "not a time", DEVICE);
      expect(picks.next).toMatchObject({ zoneKnown: false, daysUntil: null });
    });
  });

  it("does not change its input", () => {
    const events = [ev("b", ["2026-11-08", "2026-11-07"]), ev("a", ["2026-10-01"])];
    const copy = structuredClone(events);
    pickNextAndPreviousEvents(events, NOW, DEVICE);
    expect(events).toEqual(copy);
  });
});

const prov = {
  verification: "pending" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1 as const,
};
const roster = (rosterId: string, over: Partial<RaceRosterEntry> = {}): RaceRosterEntry => ({
  rosterId,
  displayName: rosterId,
  bib: "1",
  division: "Senior",
  isSelf: false,
  isFollowed: false,
  athleteRefId: null,
  ...prov,
  ...over,
});
const race = (raceId: string, day: string | null, over: Partial<RaceEntry> = {}): RaceEntry => ({
  raceId,
  distanceId: "500m",
  label: raceId,
  sortOrder: 0,
  day,
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: ["me"],
  ...prov,
  ...over,
});
const result = (raceId: string, rosterId = "me", over: Partial<RaceResult> = {}): RaceResult => ({
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
const me = roster("me", { isSelf: true });

describe("ownRosterEntry", () => {
  it("is the marked row, the first by id when several are marked, and null without one", () => {
    expect(ownRosterEntry([roster("a"), roster("c", { isSelf: true }), roster("b", { isSelf: true })])?.rosterId).toBe("b");
    expect(ownRosterEntry([roster("a")])).toBeNull();
    expect(ownRosterEntry([])).toBeNull();
  });
});

describe("recentOwnResults", () => {
  const ids = (rows: ReturnType<typeof recentOwnResults>) => rows.map((row) => row.result.raceId);

  it("newest race day first, and the same day by raceId", () => {
    const rows = recentOwnResults({
      roster: [me],
      races: [race("m", "2026-10-25"), race("a", "2026-10-25"), race("z", "2026-10-24")],
      results: [result("z"), result("m"), result("a")],
    });
    expect(ids(rows)).toEqual(["a", "m", "z"]);
  });

  it("keeps at most three, and the limit can be changed", () => {
    const races = ["a", "b", "c", "d"].map((id, index) => race(id, `2026-10-2${String(index + 1)}`));
    const results = races.map((r) => result(r.raceId));
    expect(ids(recentOwnResults({ roster: [me], races, results }))).toEqual(["d", "c", "b"]);
    expect(ids(recentOwnResults({ roster: [me], races, results }, 1))).toEqual(["d"]);
    expect(recentOwnResults({ roster: [me], races, results }, 0)).toEqual([]);
  });

  it("a race with no known day comes after every dated one", () => {
    const rows = recentOwnResults({
      roster: [me],
      races: [race("undated", null), race("junk", "tbd"), race("dated", "2026-10-01")],
      results: [result("undated"), result("junk"), result("dated")],
    });
    expect(ids(rows)).toEqual(["dated", "junk", "undated"]);
  });

  it("only the own athlete's results, never a followed athlete's", () => {
    const rows = recentOwnResults({
      roster: [me, roster("rival")],
      races: [race("a", "2026-10-25", { rosterIds: ["me", "rival"] })],
      results: [result("a", "rival"), result("a", "me")],
    });
    expect(rows.map((row) => row.result.rosterId)).toEqual(["me"]);
  });

  it("is empty without an own roster row, or when there are no results", () => {
    const races = [race("a", "2026-10-25")];
    expect(recentOwnResults({ roster: [roster("x")], races, results: [result("a", "x")] })).toEqual([]);
    expect(recentOwnResults({ roster: [me], races, results: [] })).toEqual([]);
  });

  it("leaves out a result whose race is not in the list, and keeps DNS / DNF / DQ rows", () => {
    const rows = recentOwnResults({
      roster: [me],
      races: [race("a", "2026-10-25")],
      results: [result("gone"), result("a", "me", { status: "DNF", timeSeconds: null })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.result.status).toBe("DNF");
  });
});
