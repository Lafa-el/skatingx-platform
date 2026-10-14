import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isValidRaceDayId } from "./race-day";
import {
  createIdSuffix,
  createRaceDayEntityId,
  isRealDateString,
  prepareRaceEventInput,
  prepareRaceInput,
  prepareRosterEntryInput,
  RACE_DAY_LIMITS,
  type RaceEventInput,
  type RaceInput,
  type RosterEntryInput,
} from "./race-day-input";

// Fixtures are obviously fake: no real athlete, bib or event data in tests.

const event = (over: Partial<RaceEventInput> = {}): RaceEventInput => ({
  name: "Test Championships",
  dates: ["2026-10-25", "2026-10-24"],
  timeZone: "America/New_York",
  venue: "Test Arena",
  sourceNote: "from test fixture",
  ...over,
});

const roster = (over: Partial<RosterEntryInput> = {}): RosterEntryInput => ({
  displayName: "Test Skater",
  bib: "000",
  division: "Test Division",
  isSelf: false,
  isFollowed: true,
  athleteRefId: null,
  sourceNote: "",
  ...over,
});

const race = (over: Partial<RaceInput> = {}): RaceInput => ({
  distanceId: "500m",
  label: "500m",
  sortOrder: 1,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: ["skater-1"],
  sourceNote: "",
  ...over,
});

const codes = (errors: { field: string; code: string }[]) =>
  errors.map((e) => `${e.field}:${e.code}`);

describe("isRealDateString", () => {
  it("accepts real days and rejects rollover dates and bad shapes", () => {
    expect(isRealDateString("2026-10-24")).toBe(true);
    expect(isRealDateString("2028-02-29")).toBe(true);
    expect(isRealDateString("2026-02-29")).toBe(false);
    expect(isRealDateString("2026-02-30")).toBe(false);
    expect(isRealDateString("2026-13-01")).toBe(false);
    expect(isRealDateString("2026-1-1")).toBe(false);
    expect(isRealDateString("")).toBe(false);
  });
});

describe("prepareRaceEventInput", () => {
  it("accepts a valid event and sorts dates ascending", () => {
    const { value, errors } = prepareRaceEventInput(event());
    expect(errors).toEqual([]);
    expect(value.dates).toEqual(["2026-10-24", "2026-10-25"]);
  });

  it("trims text and turns empty optional values into null", () => {
    const { value, errors } = prepareRaceEventInput(
      event({ name: "  Spaced  ", venue: "   ", timeZone: "", sourceNote: "  note " }),
    );
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ name: "Spaced", venue: null, timeZone: null, sourceNote: "note" });
  });

  it("requires a name", () => {
    expect(codes(prepareRaceEventInput(event({ name: "   " })).errors)).toEqual(["name:required"]);
  });

  it("enforces length limits at the exact boundary", () => {
    const ok = prepareRaceEventInput(event({ name: "a".repeat(RACE_DAY_LIMITS.eventName) }));
    expect(ok.errors).toEqual([]);
    const tooLong = prepareRaceEventInput(event({ name: "a".repeat(RACE_DAY_LIMITS.eventName + 1) }));
    expect(codes(tooLong.errors)).toEqual(["name:tooLong"]);
    const venue = prepareRaceEventInput(event({ venue: "v".repeat(RACE_DAY_LIMITS.venue + 1) }));
    expect(codes(venue.errors)).toEqual(["venue:tooLong"]);
    const note = prepareRaceEventInput(event({ sourceNote: "n".repeat(RACE_DAY_LIMITS.sourceNote + 1) }));
    expect(codes(note.errors)).toEqual(["sourceNote:tooLong"]);
  });

  it("validates dates: required, max count, real days, no duplicates", () => {
    expect(codes(prepareRaceEventInput(event({ dates: [] })).errors)).toEqual(["dates:required"]);
    expect(codes(prepareRaceEventInput(event({ dates: ["2026-02-30"] })).errors)).toEqual([
      "dates:invalidFormat",
    ]);
    expect(codes(prepareRaceEventInput(event({ dates: ["2026-10-24", "2026-10-24"] })).errors)).toEqual([
      "dates:duplicate",
    ]);
    const many = Array.from({ length: 11 }, (_, i) => `2026-10-${String(i + 10)}`);
    expect(codes(prepareRaceEventInput(event({ dates: many })).errors)).toEqual(["dates:tooMany"]);
    const ten = many.slice(0, 10);
    expect(prepareRaceEventInput(event({ dates: ten })).errors).toEqual([]);
  });

  it("validates the time zone against the runtime's IANA database, and allows null", () => {
    expect(prepareRaceEventInput(event({ timeZone: "Asia/Shanghai" })).errors).toEqual([]);
    expect(prepareRaceEventInput(event({ timeZone: null })).errors).toEqual([]);
    expect(codes(prepareRaceEventInput(event({ timeZone: "Mars/Olympus" })).errors)).toEqual([
      "timeZone:invalidFormat",
    ]);
  });

  it("reports every problem at once so a form can show them together", () => {
    const { errors } = prepareRaceEventInput(event({ name: "", dates: [] }));
    expect(codes(errors).sort()).toEqual(["dates:required", "name:required"]);
  });
});

describe("prepareRosterEntryInput", () => {
  it("accepts a valid entry", () => {
    const { value, errors } = prepareRosterEntryInput(roster({ isSelf: true, athleteRefId: "test-athlete" }));
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ isSelf: true, isFollowed: true, athleteRefId: "test-athlete" });
  });

  it("requires name, bib and division", () => {
    const { errors } = prepareRosterEntryInput(roster({ displayName: "", bib: " ", division: "" }));
    expect(codes(errors).sort()).toEqual(["bib:required", "displayName:required", "division:required"]);
  });

  it("keeps the bib as text: leading zeros are data, not formatting", () => {
    expect(prepareRosterEntryInput(roster({ bib: "007" })).value.bib).toBe("007");
  });

  it("enforces length limits at the exact boundary", () => {
    expect(prepareRosterEntryInput(roster({ bib: "1".repeat(RACE_DAY_LIMITS.bib) })).errors).toEqual([]);
    expect(codes(prepareRosterEntryInput(roster({ bib: "1".repeat(RACE_DAY_LIMITS.bib + 1) })).errors)).toEqual([
      "bib:tooLong",
    ]);
    expect(
      codes(prepareRosterEntryInput(roster({ division: "d".repeat(RACE_DAY_LIMITS.division + 1) })).errors),
    ).toEqual(["division:tooLong"]);
    expect(
      codes(prepareRosterEntryInput(roster({ athleteRefId: "a".repeat(RACE_DAY_LIMITS.athleteRefId + 1) })).errors),
    ).toEqual(["athleteRefId:tooLong"]);
  });

  it("treats a blank athleteRefId as null", () => {
    expect(prepareRosterEntryInput(roster({ athleteRefId: "  " })).value.athleteRefId).toBeNull();
  });
});

describe("prepareRaceInput", () => {
  it("accepts a valid race with an unknown time", () => {
    const { value, errors } = prepareRaceInput(race());
    expect(errors).toEqual([]);
    expect(value.scheduledAt).toBeNull();
  });

  it("normalizes an instant with an offset to UTC", () => {
    const { value, errors } = prepareRaceInput(race({ scheduledAt: "2026-10-24T09:30:00-04:00" }));
    expect(errors).toEqual([]);
    expect(value.scheduledAt).toBe("2026-10-24T13:30:00.000Z");
  });

  it("rejects a local time without zone or offset: no silent device-zone assumption", () => {
    expect(codes(prepareRaceInput(race({ scheduledAt: "2026-10-24T09:30" })).errors)).toEqual([
      "scheduledAt:invalidFormat",
    ]);
    expect(codes(prepareRaceInput(race({ scheduledAt: "tomorrow morning" })).errors)).toEqual([
      "scheduledAt:invalidFormat",
    ]);
    expect(codes(prepareRaceInput(race({ scheduledAt: "2026-13-40T09:30:00Z" })).errors)).toEqual([
      "scheduledAt:invalidFormat",
    ]);
  });

  it("validates sortOrder as an integer in 0..999", () => {
    for (const bad of [-1, 1000, 1.5, Number.NaN]) {
      expect(codes(prepareRaceInput(race({ sortOrder: bad })).errors)).toEqual(["sortOrder:outOfRange"]);
    }
    expect(prepareRaceInput(race({ sortOrder: 0 })).errors).toEqual([]);
    expect(prepareRaceInput(race({ sortOrder: 999 })).errors).toEqual([]);
  });

  it("validates day as a real calendar day, and allows null", () => {
    expect(prepareRaceInput(race({ day: null })).errors).toEqual([]);
    expect(codes(prepareRaceInput(race({ day: "2026-02-30" })).errors)).toEqual(["day:invalidFormat"]);
  });

  it("requires distance and label, and limits round and heat", () => {
    expect(codes(prepareRaceInput(race({ distanceId: "", label: "" })).errors).sort()).toEqual([
      "distanceId:required",
      "label:required",
    ]);
    expect(codes(prepareRaceInput(race({ round: "r".repeat(RACE_DAY_LIMITS.roundOrHeat + 1) })).errors)).toEqual([
      "round:tooLong",
    ]);
    expect(codes(prepareRaceInput(race({ heat: "h".repeat(RACE_DAY_LIMITS.roundOrHeat + 1) })).errors)).toEqual([
      "heat:tooLong",
    ]);
  });

  it("validates rosterIds: valid ids, no duplicates, max 50", () => {
    expect(codes(prepareRaceInput(race({ rosterIds: ["Bad_ID"] })).errors)).toEqual(["rosterIds:invalidFormat"]);
    expect(codes(prepareRaceInput(race({ rosterIds: ["a-1", "a-1"] })).errors)).toEqual(["rosterIds:duplicate"]);
    const fifty = Array.from({ length: 50 }, (_, i) => `s-${String(i)}`);
    expect(prepareRaceInput(race({ rosterIds: fifty })).errors).toEqual([]);
    expect(codes(prepareRaceInput(race({ rosterIds: [...fifty, "s-extra"] })).errors)).toEqual([
      "rosterIds:tooMany",
    ]);
    expect(prepareRaceInput(race({ rosterIds: [] })).errors).toEqual([]);
  });
});

describe("entity ids", () => {
  it("builds readable valid ids from labels", () => {
    expect(createRaceDayEntityId("Super 1500m", "k3x9a2")).toBe("super-1500m-k3x9a2");
    expect(isValidRaceDayId(createRaceDayEntityId("Super 1500m", "k3x9a2"))).toBe(true);
  });

  it("strips accents, and falls back to 'item' for non-ASCII-only labels", () => {
    expect(createRaceDayEntityId("Café Cup", "abcd12")).toBe("cafe-cup-abcd12");
    expect(createRaceDayEntityId("测试选手", "abcd12")).toBe("item-abcd12");
    expect(createRaceDayEntityId("  --  ", "abcd12")).toBe("item-abcd12");
  });

  it("always produces a valid id, even for a very long label", () => {
    const id = createRaceDayEntityId("x".repeat(500), "abcd12");
    expect(isValidRaceDayId(id)).toBe(true);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("never produces an underscore, which is reserved as the result-id separator", () => {
    expect(createRaceDayEntityId("a_b c", "abcd12")).not.toContain("_");
  });

  it("rejects an invalid suffix instead of producing an invalid id", () => {
    expect(() => createRaceDayEntityId("x", "AB")).toThrow(/suffix/);
    expect(() => createRaceDayEntityId("x", "ab_cd1")).toThrow(/suffix/);
  });

  it("creates a deterministic suffix from an injected random source", () => {
    let n = 0;
    const seq = [0, 0.5, 0.99, 0.1, 0.2, 0.3];
    const suffix = createIdSuffix(() => seq[n++ % seq.length] ?? 0, 6);
    expect(suffix).toBe("0iz37a");
    expect(suffix).toMatch(/^[a-z0-9]{6}$/);
  });
});

describe("limits stay in sync with firestore.rules", () => {
  // The rules are the enforced boundary. If a limit changes on one side only, this fails.
  const rules = readFileSync(path.resolve("firestore.rules"), "utf8");
  const expected: [string, string][] = [
    ["eventName", `d.name.size() <= ${String(RACE_DAY_LIMITS.eventName)}`],
    ["venue", `d.venue.size() <= ${String(RACE_DAY_LIMITS.venue)}`],
    ["timeZone", `d.timeZone.size() <= ${String(RACE_DAY_LIMITS.timeZone)}`],
    ["eventDatesMax", `d.dates.size() <= ${String(RACE_DAY_LIMITS.eventDatesMax)}`],
    ["displayName", `d.displayName.size() <= ${String(RACE_DAY_LIMITS.displayName)}`],
    ["bib", `d.bib.size() <= ${String(RACE_DAY_LIMITS.bib)}`],
    ["division", `d.division.size() <= ${String(RACE_DAY_LIMITS.division)}`],
    ["athleteRefId", `d.athleteRefId.size() <= ${String(RACE_DAY_LIMITS.athleteRefId)}`],
    ["distanceId", `d.distanceId.size() <= ${String(RACE_DAY_LIMITS.distanceId)}`],
    ["raceLabel", `d.label.size() >= 1 && d.label.size() <= ${String(RACE_DAY_LIMITS.raceLabel)}`],
    ["sortOrderMax", `d.sortOrder <= ${String(RACE_DAY_LIMITS.sortOrderMax)}`],
    ["roundOrHeat", `d.round.size() <= ${String(RACE_DAY_LIMITS.roundOrHeat)}`],
    ["roundOrHeat", `d.heat.size() <= ${String(RACE_DAY_LIMITS.roundOrHeat)}`],
    ["rosterIdsMax", `d.rosterIds.size() <= ${String(RACE_DAY_LIMITS.rosterIdsMax)}`],
    ["sourceNote", `d.sourceNote.size() <= ${String(RACE_DAY_LIMITS.sourceNote)}`],
  ];

  it.each(expected)("%s", (_name, snippet) => {
    expect(rules).toContain(snippet);
  });

  it("covers every limit constant", () => {
    const covered = new Set(expected.map(([name]) => name));
    expect(Object.keys(RACE_DAY_LIMITS).sort()).toEqual([...covered].sort());
  });
});
