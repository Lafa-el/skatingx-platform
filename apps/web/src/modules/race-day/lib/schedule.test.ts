import type { RaceEntry } from "@skatingx/schema";
import { describe, expect, it, vi } from "vitest";

import { formatRaceDay, formatRaceDays, formatRaceTime, nextSortOrder, raceOptionLabel } from "./schedule";

describe("formatRaceTime", () => {
  it("shows the wall time in the event zone with the zone name, whatever the device zone", () => {
    const text = formatRaceTime("2026-10-24T13:30:00.000Z", "en", "America/New_York");
    expect(text).toMatch(/9:30\s?AM/);
    expect(text).toMatch(/EDT/);
  });

  it("labels the time as UTC when the event has no zone, instead of guessing one", () => {
    expect(formatRaceTime("2026-10-24T13:30:00.000Z", "en", null)).toMatch(/UTC/);
  });

  it("formats in Chinese", () => {
    expect(formatRaceTime("2026-10-24T13:30:00.000Z", "zh", "America/New_York")).toMatch(/9:30/);
  });

  it("falls back to the raw value for an unreadable instant or zone, without throwing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(formatRaceTime("garbage", "en", null)).toBe("garbage");
    expect(formatRaceTime("2026-10-24T13:30:00.000Z", "en", "Mars/Base")).toBe("2026-10-24T13:30:00.000Z");
  });
});

describe("formatRaceDay", () => {
  it("formats a calendar day without shifting it by zone", () => {
    expect(formatRaceDay("2026-10-24", "en")).toMatch(/Sat/);
    expect(formatRaceDay("2026-10-24", "en")).toMatch(/24/);
    expect(formatRaceDay("2026-10-25", "en")).toMatch(/Sun/);
  });

  it("returns the input for something that is not a date", () => {
    expect(formatRaceDay("soon", "en")).toBe("soon");
  });
});

describe("nextSortOrder", () => {
  const race = (sortOrder: number) => ({ sortOrder }) as RaceEntry;
  it("is 0 for an empty schedule and one past the largest otherwise", () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([race(0), race(5), race(2)])).toBe(6);
  });
});

describe("raceOptionLabel", () => {
  const base = { label: "500m", day: "2026-10-24" } as const;

  it("shows the day in the reader's language, never as a raw ISO date", () => {
    expect(raceOptionLabel(base, 2, "zh")).toBe("#2 500m · 10月24日周六");
    expect(raceOptionLabel(base, 2, "en")).toBe("#2 500m · Sat, Oct 24");
  });

  it("leaves out the day when it is not known, and the number when there is none", () => {
    expect(raceOptionLabel({ label: "500m", day: null }, 1, "zh")).toBe("#1 500m");
    expect(raceOptionLabel(base, null, "en")).toBe("500m · Sat, Oct 24");
  });
});

describe("formatRaceDays", () => {
  it("sorts the days and joins them with the language's separator", () => {
    expect(formatRaceDays(["2026-10-25", "2026-10-24"], "zh")).toBe("10月24日周六、10月25日周日");
    expect(formatRaceDays(["2026-10-25", "2026-10-24"], "en")).toBe("Sat, Oct 24 / Sun, Oct 25");
  });

  it("does not change the list it is given", () => {
    const days = ["2026-10-25", "2026-10-24"];
    formatRaceDays(days, "en");
    expect(days).toEqual(["2026-10-25", "2026-10-24"]);
  });
});
