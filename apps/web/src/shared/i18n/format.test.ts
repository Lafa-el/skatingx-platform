import { describe, expect, it } from "vitest";

import { formatCalendarDate } from "./format";

describe("formatCalendarDate", () => {
  it("writes a calendar day the way each language does", () => {
    expect(formatCalendarDate("2026-10-16", "zh")).toBe("2026年10月16日");
    expect(formatCalendarDate("2026-10-16", "en")).toBe("Oct 16, 2026");
  });

  it("does not move the day with the viewer's time zone", () => {
    // A calendar day has no time of day. Reading it as local midnight would show the day before
    // for anyone west of UTC; it is read as UTC and shown as UTC.
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(formatCalendarDate("2026-01-01", "en")).toBe("Jan 1, 2026");
      process.env.TZ = "Pacific/Kiritimati";
      expect(formatCalendarDate("2026-01-01", "en")).toBe("Jan 1, 2026");
    } finally {
      if (original === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = original;
      }
    }
  });

  it("handles month and year boundaries and leap days", () => {
    expect(formatCalendarDate("2026-12-31", "en")).toBe("Dec 31, 2026");
    expect(formatCalendarDate("2024-02-29", "zh")).toBe("2024年2月29日");
  });

  it("returns anything that is not a real calendar day unchanged, never a wrong date", () => {
    expect(formatCalendarDate("2026-02-31", "en")).toBe("2026-02-31");
    expect(formatCalendarDate("2025-02-29", "en")).toBe("2025-02-29");
    expect(formatCalendarDate("2026-13-01", "zh")).toBe("2026-13-01");
    expect(formatCalendarDate("10/16/2026", "en")).toBe("10/16/2026");
    expect(formatCalendarDate("2026-10-16T10:00:00Z", "en")).toBe("2026-10-16T10:00:00Z");
    expect(formatCalendarDate("", "en")).toBe("");
    expect(formatCalendarDate("not a date", "zh")).toBe("not a date");
  });
});
