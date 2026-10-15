import { describe, expect, it } from "vitest";

import { isValidRaceDayId } from "./race-day";
import { prepareRaceEventInput, prepareRaceInput } from "./race-day-input";
import { BUFFALO_2026_TEMPLATE, RACE_DAY_TEMPLATES } from "./race-day-templates";

describe("Buffalo 2026 template", () => {
  const t = BUFFALO_2026_TEMPLATE;

  it("passes the same validation as manual entry, with no errors", () => {
    expect(prepareRaceEventInput(t.event).errors).toEqual([]);
    for (const race of t.races) {
      expect(prepareRaceInput(race.input).errors).toEqual([]);
    }
  });

  it("has the agreed event name, days and distances in order", () => {
    expect(t.event.name).toBe("Buffalo Championships");
    expect(t.event.dates).toEqual(["2026-10-24", "2026-10-25"]);
    expect(t.races.map((r) => r.input.label)).toEqual(["500m", "500m", "1000m", "Super 1500m"]);
    expect(t.races.map((r) => r.input.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("carries nothing unverified or personal: no time zone, day, time, round, heat or athletes", () => {
    expect(t.event.timeZone).toBeNull();
    expect(t.event.venue).toBeNull();
    for (const { input } of t.races) {
      expect(input.day).toBeNull();
      expect(input.scheduledAt).toBeNull();
      expect(input.round).toBeNull();
      expect(input.heat).toBeNull();
      expect(input.rosterIds).toEqual([]);
    }
  });

  it("contains no athlete name, bib or division text anywhere", () => {
    const text = JSON.stringify(t).toLowerCase();
    for (const forbidden of ["lindsay", "134", "division", "wings", "bib"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("says in its source note that it is an unverified template", () => {
    expect(t.event.sourceNote).toMatch(/not verified/);
    for (const { input } of t.races) {
      expect(input.sourceNote).toMatch(/not verified/);
    }
  });

  it("uses valid, unique ids", () => {
    const ids = [t.eventId, ...t.races.map((r) => r.raceId)];
    expect(ids.every(isValidRaceDayId)).toBe(true);
    expect(new Set(t.races.map((r) => r.raceId)).size).toBe(t.races.length);
  });

  it("is registered, with unique event ids across templates", () => {
    expect(RACE_DAY_TEMPLATES).toContain(t);
    expect(new Set(RACE_DAY_TEMPLATES.map((x) => x.eventId)).size).toBe(RACE_DAY_TEMPLATES.length);
  });
});
