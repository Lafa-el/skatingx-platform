import { describe, expect, it } from "vitest";

import { journalDayForDate, journalDayMark, mapJournalDayDetail } from "./journal-calendar";

const day = (id: string, date: string, extra: Record<string, unknown> = {}) => ({ id, date, ...extra });

describe("journalDayMark", () => {
  const days = [{ date: "2026-06-08" }];
  const sessions = [{ date: "2026-06-08" }, { date: "2026-07-01" }];

  it("a diary marks the day even when a session is there too", () => {
    expect(journalDayMark("2026-06-08", days, sessions)).toBe("journal");
  });

  it("a session alone marks the day", () => {
    expect(journalDayMark("2026-07-01", days, sessions)).toBe("session");
  });

  it("a day with neither stays empty", () => {
    expect(journalDayMark("2026-06-09", days, sessions)).toBe("none");
  });
});

describe("mapJournalDayDetail", () => {
  it("shows stored fields and leaves missing optionals off the detail", () => {
    const detail = mapJournalDayDetail(
      {
        id: "src-1",
        date: "2026-06-08",
        location: "Buffalo",
        overallFeeling: 4,
        lindsayReflection: { bestThing: "starts" },
      },
      [
        { id: "s1", date: "2026-06-08", sessionLabel: "ice" },
        { id: "s2", date: "2026-06-08" },
        { id: "s3", date: "2026-07-01", sessionLabel: "other day" },
      ],
      "2026-06-08",
    );
    expect(detail).toEqual({
      date: "2026-06-08",
      location: "Buffalo",
      overallFeeling: 4,
      lindsayReflection: { bestThing: "starts" },
      sessions: [{ sessionLabel: "ice" }],
    });
    expect(detail).not.toHaveProperty("energy");
    expect(detail).not.toHaveProperty("soreness");
    expect(detail).not.toHaveProperty("parentNote");
    expect(detail.lindsayReflection).not.toHaveProperty("needsWork");
  });

  it("a day with only sessions has no diary fields", () => {
    const detail = mapJournalDayDetail(null, [{ id: "s1", date: "2026-07-01", sessionLabel: "dryland" }], "2026-07-01");
    expect(detail).toEqual({ sessions: [{ sessionLabel: "dryland" }] });
    expect(detail).not.toHaveProperty("date");
  });
});

describe("journalDayForDate", () => {
  it("prefers the date-id document over a migrated source id", () => {
    const picked = journalDayForDate(
      [day("src-1", "2026-11-02", { location: "old" }), day("2026-11-02", "2026-11-02", { location: "new" })],
      "2026-11-02",
    );
    expect(picked?.id).toBe("2026-11-02");
  });
});
