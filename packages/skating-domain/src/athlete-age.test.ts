import { describe, expect, it } from "vitest";

import {
  formatSkatingDuration,
  getAgeCategory,
  getRealAge,
  getSkatingAge,
  getSkatingDuration,
} from "./athlete-age";

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
    [6, "初级前", "Pre-Novice"],
    [7, "少年F（7/8岁）", "Junior F (7/8)"],
    [11, "少年D（11/12岁）", "Junior D (11/12)"],
    [12, "少年D（11/12岁）", "Junior D (11/12)"],
    [13, "少年C（13/14岁）", "Junior C (13/14)"],
    [18, "少年A（17/18岁）", "Junior A (17/18)"],
    [19, "高级（18岁以上）", "Senior (18+)"],
  ])("maps skating age %s", (age, zh, en) => {
    expect(getAgeCategory(age)).toBe(zh);
    expect(getAgeCategory(age, "en")).toBe(en);
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
