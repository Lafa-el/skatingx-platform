import type { TimeEntry } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import {
  formatSecondsToTime,
  getBestTime,
  getLatestTime,
  normalizeDistanceId,
  parseTimeToSeconds,
  sortRecordsByDate,
} from "./records";

// Characterization tests: they pin the CURRENT behavior of functions that the Race Day
// module will reuse (AGENTS.md: surround existing behavior with regression tests before
// building on it). They document what the code does, not what it ideally should do.

function entry(partial: Partial<TimeEntry> & Pick<TimeEntry, "id" | "timeSeconds">): TimeEntry {
  return {
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("parseTimeToSeconds", () => {
  it.each([
    ["49.8", 49.8],
    ["0:49.80", 49.8],
    ["1:44.23", 104.23],
    ["2:47.00", 167],
    ["  49.8  ", 49.8],
    ["30:00", 1800],
  ])("parses %j as %d seconds", (input, expected) => {
    expect(parseTimeToSeconds(input)).toBe(expected);
  });

  it.each([
    ["empty string", ""],
    ["whitespace only", "   "],
    ["non-numeric", "abc"],
    ["non-numeric seconds part", "1:xx"],
    ["zero", "0"],
    ["negative", "-5"],
    ["over the 30 minute limit", "30:01"],
  ])("returns null for %s", (_label, input) => {
    expect(parseTimeToSeconds(input)).toBeNull();
  });
});

describe("formatSecondsToTime", () => {
  it.each([
    [49.8, "49.80"],
    [5.5, "5.50"],
    [60, "1:00.00"],
    [61.05, "1:01.05"],
    [104.23, "1:44.23"],
  ])("formats %d seconds as %j", (seconds, expected) => {
    expect(formatSecondsToTime(seconds)).toBe(expected);
  });

  it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "returns the placeholder for invalid input %d",
    (seconds) => {
      expect(formatSecondsToTime(seconds)).toBe("--");
    },
  );

  it("round-trips common race times", () => {
    for (const text of ["49.80", "1:44.23", "2:47.00"]) {
      const seconds = parseTimeToSeconds(text);
      expect(seconds).not.toBeNull();
      expect(formatSecondsToTime(seconds as number)).toBe(text);
    }
  });
});

describe("getBestTime / getLatestTime / sortRecordsByDate", () => {
  it("returns null for an empty list", () => {
    expect(getBestTime([])).toBeNull();
    expect(getLatestTime([])).toBeNull();
  });

  it("picks the lowest time as best", () => {
    const entries = [
      entry({ id: "a", timeSeconds: 50.1 }),
      entry({ id: "b", timeSeconds: 49.8 }),
      entry({ id: "c", timeSeconds: 51 }),
    ];
    expect(getBestTime(entries)?.id).toBe("b");
  });

  it("sorts newest date first and breaks date ties by createdAt descending", () => {
    const entries = [
      entry({ id: "old", timeSeconds: 50, date: "2026-01-01" }),
      entry({
        id: "same-day-early",
        timeSeconds: 50,
        date: "2026-02-01",
        createdAt: "2026-02-01T08:00:00.000Z",
      }),
      entry({
        id: "same-day-late",
        timeSeconds: 50,
        date: "2026-02-01",
        createdAt: "2026-02-01T18:00:00.000Z",
      }),
    ];
    expect(sortRecordsByDate(entries).map((e) => e.id)).toEqual([
      "same-day-late",
      "same-day-early",
      "old",
    ]);
    expect(getLatestTime(entries)?.id).toBe("same-day-late");
  });

  it("does not mutate the input array", () => {
    const entries = [
      entry({ id: "a", timeSeconds: 50, date: "2026-01-01" }),
      entry({ id: "b", timeSeconds: 50, date: "2026-03-01" }),
    ];
    sortRecordsByDate(entries);
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("normalizeDistanceId", () => {
  it.each([
    ["500m", "500m"],
    ["Start Half Lap", "start_half_lap"],
    ["Super 1500m", "super_1500m"],
    ["  Fastest   Lap  ", "fastest_lap"],
    ["", "distance"],
    ["!!!", "distance"],
  ])("normalizes %j to %j", (label, expected) => {
    expect(normalizeDistanceId(label)).toBe(expected);
  });
});
