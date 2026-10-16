import type { RaceEntry, RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it, vi } from "vitest";

import { formatSavedAt, pickSelfAthlete, raceNumberById } from "./summary";

const prov = {
  verification: "pending" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1 as const,
};
const athlete = (rosterId: string, isSelf: boolean): RaceRosterEntry => ({
  rosterId,
  displayName: rosterId,
  bib: "1",
  division: "D",
  isSelf,
  isFollowed: !isSelf,
  athleteRefId: null,
  ...prov,
});
const race = (raceId: string, sortOrder: number): RaceEntry => ({
  raceId,
  distanceId: "500m",
  label: raceId,
  sortOrder,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: [],
  ...prov,
});

describe("pickSelfAthlete", () => {
  it("returns null when nobody is marked as the user's own athlete", () => {
    expect(pickSelfAthlete([athlete("a", false)])).toEqual({ self: null, selfCount: 0 });
    expect(pickSelfAthlete([])).toEqual({ self: null, selfCount: 0 });
  });

  it("returns the own athlete, never a followed one", () => {
    const { self, selfCount } = pickSelfAthlete([athlete("a", false), athlete("b", true)]);
    expect(self?.rosterId).toBe("b");
    expect(selfCount).toBe(1);
  });

  it("with several, picks the first by id deterministically and reports how many", () => {
    const { self, selfCount } = pickSelfAthlete([athlete("z", true), athlete("m", true)]);
    expect(self?.rosterId).toBe("m");
    expect(selfCount).toBe(2);
  });
});

describe("raceNumberById", () => {
  it("numbers races by position in the whole schedule", () => {
    const numbers = raceNumberById([race("late", 2), race("early", 1)]);
    expect(numbers.get("early")).toBe(1);
    expect(numbers.get("late")).toBe(2);
  });
});

describe("formatSavedAt", () => {
  it("shows the event's time zone with its abbreviation", () => {
    const text = formatSavedAt("2026-10-24T16:30:00.000Z", "en", "America/New_York");
    expect(text).toContain("12:30");
    expect(text).toMatch(/EDT/);
  });

  it("with no zone shows UTC and says so, never a guessed zone", () => {
    expect(formatSavedAt("2026-10-24T16:30:00.000Z", "en", null)).toMatch(/UTC/);
  });

  it("is locale aware", () => {
    expect(formatSavedAt("2026-10-24T16:30:00.000Z", "zh", "America/New_York")).toContain("2026");
    expect(formatSavedAt("2026-10-24T16:30:00.000Z", "zh", "America/New_York")).not.toBe(
      formatSavedAt("2026-10-24T16:30:00.000Z", "en", "America/New_York"),
    );
  });

  it("returns the raw text for something that is not a time, and for an unknown zone", () => {
    expect(formatSavedAt("nope", "en", null)).toBe("nope");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(formatSavedAt("2026-10-24T16:30:00.000Z", "en", "Not/AZone")).toBe("2026-10-24T16:30:00.000Z");
    warn.mockRestore();
  });
});
