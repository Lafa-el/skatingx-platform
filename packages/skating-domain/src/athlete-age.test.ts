import { describe, expect, it } from "vitest";

import {
  formatSkatingDuration,
  getAgeCategory,
  getRealAge,
  getSkatingAge,
  getSkatingDuration,
  isValidDateString,
} from "./athlete-age";

describe("isValidDateString", () => {
  it("accepts a real day and rejects a missing day, a bad shape, and an empty string", () => {
    expect(isValidDateString("2015-01-14")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026/02/01")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});

describe("getRealAge", () => {
  it("waits for the birthday", () => {
    expect(getRealAge("2015-01-14", "2026-01-13")).toBe(10);
    expect(getRealAge("2015-01-14", "2026-01-14")).toBe(11);
    expect(getRealAge("2015-01-14", "2026-11-03")).toBe(11);
  });

  it("rejects a date that is not a calendar day", () => {
    expect(getRealAge("unknown", "2026-11-03")).toBeNull();
    expect(getRealAge("2015-02-31", "2026-11-03")).toBeNull();
  });
});

describe("getSkatingAge", () => {
  it("uses the season that starts on 1 July, and July–December births are a year younger", () => {
    expect(getSkatingAge("2015-01-14", "2026-03-01")).toBe(10);
    expect(getSkatingAge("2015-01-14", "2026-07-01")).toBe(11);
    expect(getSkatingAge("2015-01-14", "2026-11-03")).toBe(11);
    expect(getSkatingAge("2015-09-10", "2026-11-03")).toBe(10);
    expect(getRealAge("2015-09-10", "2026-11-03")).toBe(11);
  });
});

describe("getAgeCategory", () => {
  it.each([
    [6, "Novice"],
    [7, "U-11/Junior E"],
    [8, "U-11/Junior E"],
    [10, "U-11/Junior E"],
    [11, "U-13/Junior D"],
    [12, "U-13/Junior D"],
    [13, "U-15/Junior C"],
    [15, "U-17/Junior B"],
    [18, "U-19/Junior A"],
    [19, "Senior"],
  ])("maps skating age %s to %s", (age, label) => {
    expect(getAgeCategory(age)).toBe(label);
  });
});

describe("getSkatingDuration", () => {
  it("counts local calendar days, including a borrow from the previous month", () => {
    expect(getSkatingDuration("2021-05-12", "2026-11-03")).toEqual({ years: 5, months: 5, days: 22 });
    expect(getSkatingDuration("2021-05-12", "2026-05-12")).toEqual({ years: 5, months: 0, days: 0 });
    expect(getSkatingDuration("2021-01-31", "2026-02-28")).toEqual({ years: 5, months: 0, days: 28 });
  });

  it("formats Chinese as one phrase and English with the old plural rule", () => {
    const five = getSkatingDuration("2021-05-12", "2026-11-03");
    expect(five).not.toBeNull();
    expect(formatSkatingDuration(five!, "zh")).toBe("5 年 5 个月 22 天");
    expect(formatSkatingDuration({ years: 5, months: 0, days: 0 }, "zh")).toBe("5 年 0 个月 0 天");
    expect(formatSkatingDuration({ years: 1, months: 1, days: 1 }, "en")).toBe("1 year 1 month 1 day");
    expect(formatSkatingDuration({ years: 5, months: 0, days: 0 }, "en")).toBe("5 years 0 months 0 days");
    expect(formatSkatingDuration({ years: 0, months: 0, days: 0 }, "en")).toBe("0 year 0 months 0 days");
  });
});
