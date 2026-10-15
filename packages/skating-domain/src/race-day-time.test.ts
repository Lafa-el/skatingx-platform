import { describe, expect, it } from "vitest";

import { instantToZonedDateTime, zonedDateTimeToInstant } from "./race-day-time";

const NY = "America/New_York";

describe("zonedDateTimeToInstant", () => {
  it("converts Buffalo wall time (EDT, UTC-4) to a UTC instant", () => {
    expect(zonedDateTimeToInstant("2026-10-24", "09:30", NY)).toBe("2026-10-24T13:30:00.000Z");
  });

  it("uses the winter offset after the clock change (EST, UTC-5)", () => {
    expect(zonedDateTimeToInstant("2026-11-02", "09:30", NY)).toBe("2026-11-02T14:30:00.000Z");
  });

  it("handles zones east of Greenwich and a date change", () => {
    expect(zonedDateTimeToInstant("2026-10-24", "01:15", "Asia/Shanghai")).toBe(
      "2026-10-23T17:15:00.000Z",
    );
  });

  it("rejects a wall time that does not exist (spring-forward gap)", () => {
    expect(zonedDateTimeToInstant("2026-03-08", "02:30", NY)).toBeNull();
  });

  it("accepts the hour just after the gap", () => {
    expect(zonedDateTimeToInstant("2026-03-08", "03:00", NY)).toBe("2026-03-08T07:00:00.000Z");
  });

  it("rejects bad day, bad time and unknown zone instead of guessing", () => {
    expect(zonedDateTimeToInstant("2026-02-30", "09:00", NY)).toBeNull();
    expect(zonedDateTimeToInstant("2026-10-24", "24:00", NY)).toBeNull();
    expect(zonedDateTimeToInstant("2026-10-24", "9:30", NY)).toBeNull();
    expect(zonedDateTimeToInstant("2026-10-24", "09:30", "Mars/Base")).toBeNull();
  });
});

describe("instantToZonedDateTime", () => {
  it("shows the wall time in the given zone", () => {
    expect(instantToZonedDateTime("2026-10-24T13:30:00.000Z", NY)).toEqual({
      day: "2026-10-24",
      time: "09:30",
    });
  });

  it("shows the local date, which can differ from the UTC date", () => {
    expect(instantToZonedDateTime("2026-10-25T02:30:00.000Z", NY)).toEqual({
      day: "2026-10-24",
      time: "22:30",
    });
  });

  it("round-trips through the first function", () => {
    for (const [day, time] of [
      ["2026-10-24", "00:00"],
      ["2026-10-24", "23:59"],
      ["2026-11-01", "12:00"],
    ] as const) {
      const instant = zonedDateTimeToInstant(day, time, NY);
      expect(instant).not.toBeNull();
      expect(instantToZonedDateTime(instant as string, NY)).toEqual({ day, time });
    }
  });

  it("returns null for an unreadable instant or zone", () => {
    expect(instantToZonedDateTime("not a date", NY)).toBeNull();
    expect(instantToZonedDateTime("2026-10-24T13:30:00.000Z", "Mars/Base")).toBeNull();
  });
});
