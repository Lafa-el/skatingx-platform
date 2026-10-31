import { describe, expect, it } from "vitest";

import {
  instantToZonedDateTime,
  rezoneInstant,
  rezoneRaceSchedules,
  zonedDateTimeToInstant,
} from "./race-day-time";

const NY = "America/New_York";
const CHI = "America/Chicago";

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

describe("rezoneInstant", () => {
  it("keeps the wall clock: 13:00 in New York becomes 13:00 in Chicago, an hour later in absolute time", () => {
    const fromNy = zonedDateTimeToInstant("2026-10-24", "13:00", NY)!;
    expect(fromNy).toBe("2026-10-24T17:00:00.000Z");
    const inChicago = rezoneInstant(fromNy, NY, CHI);
    expect(inChicago).toBe("2026-10-24T18:00:00.000Z");
    expect(Date.parse(inChicago!) - Date.parse(fromNy)).toBe(60 * 60 * 1000);
    expect(instantToZonedDateTime(inChicago!, CHI)).toEqual({ day: "2026-10-24", time: "13:00" });
  });

  it("goes the other way too (Chicago to New York is an hour earlier)", () => {
    expect(rezoneInstant("2026-10-24T18:00:00.000Z", CHI, NY)).toBe("2026-10-24T17:00:00.000Z");
  });

  it("works across the clock change on 2026-11-01 (both zones are on standard time that day)", () => {
    const fromNy = zonedDateTimeToInstant("2026-11-01", "13:00", NY)!;
    expect(fromNy).toBe("2026-11-01T18:00:00.000Z");
    expect(rezoneInstant(fromNy, NY, CHI)).toBe("2026-11-01T19:00:00.000Z");
  });

  it("can change the day when the zones are far apart", () => {
    const late = zonedDateTimeToInstant("2026-10-24", "23:30", NY)!;
    expect(rezoneInstant(late, NY, "Asia/Shanghai")).toBe("2026-10-24T15:30:00.000Z");
    expect(instantToZonedDateTime("2026-10-24T15:30:00.000Z", "Asia/Shanghai")).toEqual({
      day: "2026-10-24",
      time: "23:30",
    });
  });

  it("is null for an invalid instant or an invalid zone, on either side", () => {
    expect(rezoneInstant("not a time", NY, CHI)).toBeNull();
    expect(rezoneInstant("2026-10-24T17:00:00.000Z", "Mars/Base", CHI)).toBeNull();
    expect(rezoneInstant("2026-10-24T17:00:00.000Z", NY, "Mars/Base")).toBeNull();
  });

  it("is null when the wall time does not exist in the new zone (spring-forward gap)", () => {
    // 02:30 on 2026-03-08 is a real time in Shanghai but is skipped in New York.
    const shanghai = zonedDateTimeToInstant("2026-03-08", "02:30", "Asia/Shanghai")!;
    expect(rezoneInstant(shanghai, "Asia/Shanghai", NY)).toBeNull();
  });
});

describe("rezoneRaceSchedules", () => {
  const at = (day: string, time: string, zone: string) => zonedDateTimeToInstant(day, time, zone)!;

  it("returns only the races that change, with the recalculated instant", () => {
    const changes = rezoneRaceSchedules(
      [
        { raceId: "a", scheduledAt: at("2026-10-24", "09:30", NY) },
        { raceId: "b", scheduledAt: at("2026-10-25", "14:05", NY) },
      ],
      NY,
      CHI,
    );
    expect(changes).toEqual([
      { raceId: "a", scheduledAt: at("2026-10-24", "09:30", CHI) },
      { raceId: "b", scheduledAt: at("2026-10-25", "14:05", CHI) },
    ]);
  });

  it("skips a race with no time", () => {
    expect(rezoneRaceSchedules([{ raceId: "a", scheduledAt: null }], NY, CHI)).toEqual([]);
  });

  it("skips a race whose time cannot be recalculated, and still returns the others", () => {
    const shanghai = at("2026-03-08", "02:30", "Asia/Shanghai");
    expect(
      rezoneRaceSchedules(
        [
          { raceId: "gap", scheduledAt: shanghai },
          { raceId: "bad", scheduledAt: "not a time" },
          { raceId: "fine", scheduledAt: at("2026-03-08", "09:00", "Asia/Shanghai") },
        ],
        "Asia/Shanghai",
        NY,
      ),
    ).toEqual([{ raceId: "fine", scheduledAt: at("2026-03-08", "09:00", NY) }]);
  });

  it("skips a race whose new instant is the same as the old one", () => {
    // Same absolute offset, so nothing would change: UTC to UTC, or a zone to itself.
    const instant = "2026-10-24T13:30:00.000Z";
    expect(rezoneRaceSchedules([{ raceId: "a", scheduledAt: instant }], "UTC", "Etc/UTC")).toEqual([]);
    expect(rezoneRaceSchedules([{ raceId: "a", scheduledAt: instant }], NY, NY)).toEqual([]);
  });
});
