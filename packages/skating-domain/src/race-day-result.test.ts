import { describe, expect, it } from "vitest";

import { validateRaceResultInput } from "./race-day";
import {
  formatResultTime,
  parseResultTime,
  prepareRaceResultInput,
  type RaceResultFormInput,
} from "./race-day-input";

describe("parseResultTime", () => {
  it.each([
    ["49", 49],
    ["49.8", 49.8],
    ["49.80", 49.8],
    ["49.123", 49.123],
    ["0:49.80", 49.8],
    ["1:44.23", 104.23],
    ["1:44.231", 104.231],
    ["2:47", 167],
    ["10:00.5", 600.5],
    ["30:00", 1800],
    ["30:00.000", 1800],
    ["  49.8  ", 49.8],
    ["75.5", 75.5],
    ["0.001", 0.001],
  ])("accepts %s as %s seconds", (text, seconds) => {
    expect(parseResultTime(text)).toEqual({ ok: true, seconds });
  });

  it("is exact in milliseconds: no floating point drift on three decimals", () => {
    for (const ms of [1, 999, 49123, 104231, 1799999, 1234567]) {
      const text = formatResultTime(ms / 1000);
      expect(parseResultTime(text)).toEqual({ ok: true, seconds: ms / 1000 });
    }
    const parsed = parseResultTime("1.005");
    expect(parsed).toEqual({ ok: true, seconds: 1.005 });
  });

  it.each([
    "",
    "abc",
    "49,8",
    "49.",
    ".5",
    "-5",
    "1:75.00",
    "1:60",
    "1:30:00",
    "0:00",
    "0",
    "0.000",
    "30:00.001",
    "31:00",
    "99:00",
    "12345",
    "1800.001",
    "4 9",
  ])("rejects %j as invalid", (text) => {
    expect(parseResultTime(text)).toEqual({ ok: false, code: "timeInvalid" });
  });

  it("explains four or more decimals separately, so the form can say what to fix", () => {
    expect(parseResultTime("49.1234")).toEqual({ ok: false, code: "timeDecimals" });
    expect(parseResultTime("0:49.8000")).toEqual({ ok: false, code: "timeDecimals" });
  });
});

describe("formatResultTime", () => {
  it.each([
    [49.8, "49.80"],
    [49, "49.00"],
    [49.123, "49.123"],
    [49.12, "49.12"],
    [49.1, "49.10"],
    [5.5, "5.50"],
    [104.23, "1:44.23"],
    [104.231, "1:44.231"],
    [64.5, "1:04.50"],
    [600, "10:00.00"],
    [1800, "30:00.00"],
    [0.001, "0.001"],
  ])("formats %s as %s", (seconds, text) => {
    expect(formatResultTime(seconds)).toBe(text);
  });

  it("shows -- for values that cannot be a time", () => {
    expect(formatResultTime(Number.NaN)).toBe("--");
    expect(formatResultTime(-1)).toBe("--");
    expect(formatResultTime(Number.POSITIVE_INFINITY)).toBe("--");
  });

  it("round-trips through the parser for every kind of value", () => {
    for (const seconds of [0.001, 0.5, 9.99, 49.8, 49.123, 59.999, 60, 104.23, 599.999, 1800]) {
      expect(parseResultTime(formatResultTime(seconds))).toEqual({ ok: true, seconds });
    }
  });
});

const form = (over: Partial<RaceResultFormInput> = {}): RaceResultFormInput => ({
  status: "finished",
  time: "0:49.123",
  place: "2",
  advanced: true,
  sourceNote: "  from the board  ",
  ...over,
});

const codes = (r: { errors: { field: string; code: string }[] }) =>
  r.errors.map((e) => `${e.field}:${e.code}`);

describe("prepareRaceResultInput", () => {
  it("normalizes a finished result", () => {
    const r = prepareRaceResultInput(form());
    expect(r.errors).toEqual([]);
    expect(r.value).toEqual({
      status: "finished",
      timeSeconds: 49.123,
      place: 2,
      advanced: true,
      sourceNote: "from the board",
    });
  });

  it("place and advancement are optional for a finished race, and unknown stays null", () => {
    const r = prepareRaceResultInput(form({ place: "  ", advanced: null }));
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({ place: null, advanced: null });
  });

  it("keeps advanced=false, which is different from unknown", () => {
    expect(prepareRaceResultInput(form({ advanced: false })).value.advanced).toBe(false);
  });

  it("requires a time for a finished race", () => {
    expect(codes(prepareRaceResultInput(form({ time: " " })))).toEqual(["time:timeRequired"]);
  });

  it("reports an invalid time and too many decimals separately", () => {
    expect(codes(prepareRaceResultInput(form({ time: "1:75.00" })))).toEqual(["time:timeInvalid"]);
    expect(codes(prepareRaceResultInput(form({ time: "49.1234" })))).toEqual(["time:timeDecimals"]);
  });

  it.each(["0", "-1", "1.5", "abc", "1000", "01234"])("rejects place %j", (place) => {
    expect(codes(prepareRaceResultInput(form({ place })))).toEqual(["place:placeInvalid"]);
  });

  it("accepts the boundary places 1 and 999", () => {
    expect(prepareRaceResultInput(form({ place: "1" })).value.place).toBe(1);
    expect(prepareRaceResultInput(form({ place: "999" })).value.place).toBe(999);
  });

  it.each(["DNS", "DNF", "DQ"] as const)("%s carries no time, place or advancement", (status) => {
    const ok = prepareRaceResultInput(form({ status, time: "", place: "", advanced: null }));
    expect(ok.errors).toEqual([]);
    expect(ok.value).toEqual({
      status,
      timeSeconds: null,
      place: null,
      advanced: null,
      sourceNote: "from the board",
    });

    const bad = prepareRaceResultInput(form({ status }));
    expect(codes(bad)).toEqual(["time:timeNotAllowed", "place:placeNotAllowed", "advanced:advancedNotAllowed"]);
    expect(bad.value).toMatchObject({ timeSeconds: null, place: null, advanced: null });
  });

  it("allows advanced=false for a non-finished status", () => {
    const r = prepareRaceResultInput(form({ status: "DNF", time: "", place: "", advanced: false }));
    expect(r.errors).toEqual([]);
    expect(r.value.advanced).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(codes(prepareRaceResultInput(form({ status: "won" })))).toContain("status:statusInvalid");
  });

  it("limits the source note", () => {
    expect(codes(prepareRaceResultInput(form({ sourceNote: "n".repeat(501) })))).toEqual([
      "sourceNote:tooLong",
    ]);
  });

  it("agrees with the S1 validator: everything it accepts passes validateRaceResultInput", () => {
    const cases: Partial<RaceResultFormInput>[] = [
      {},
      { time: "30:00" },
      { place: "" },
      { advanced: null },
      { status: "DNS", time: "", place: "", advanced: null },
      { status: "DQ", time: "", place: "", advanced: false },
    ];
    for (const over of cases) {
      const r = prepareRaceResultInput(form(over));
      expect(r.errors).toEqual([]);
      expect(validateRaceResultInput(r.value)).toEqual([]);
    }
  });
});
