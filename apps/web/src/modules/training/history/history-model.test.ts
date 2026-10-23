import { describe, expect, it } from "vitest";

import {
  calendarCells,
  canShowNextMonth,
  completionCount,
  dayMark,
  defaultSelectedDate,
  monthDateBounds,
  resolveSelectedDate,
  shiftMonth,
} from "./history-model";

const october = { year: 2026, month: 10 };

describe("history month bounds", () => {
  it("uses the first and last calendar day as document-id bounds", () => {
    expect(monthDateBounds(october)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthDateBounds({ year: 2026, month: 2 })).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthDateBounds({ year: 2024, month: 2 })).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });

  it("does not offer a month after the month that contains today", () => {
    expect(canShowNextMonth(october, "2026-10-23")).toBe(false);
    expect(canShowNextMonth({ year: 2026, month: 11 }, "2026-10-23")).toBe(false);
    expect(canShowNextMonth({ year: 2026, month: 9 }, "2026-10-23")).toBe(true);
  });

  it("rolls the year at January and December", () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 });
  });

  it("starts the grid on Monday and keeps whole weeks", () => {
    const cells = calendarCells(october);
    expect(cells.filter((cell) => cell === null).length).toBeGreaterThan(0);
    expect(cells.length % 7).toBe(0);
    expect(cells[3]).toBe("2026-10-01");
    expect(cells.indexOf("2026-10-31")).toBe(33);
    expect(cells[34]).toBeNull();
  });
});

describe("history day marks", () => {
  const archived = new Set(["2026-10-19"]);
  const completed = new Set(["2026-10-19", "2026-10-02"]);

  it("marks an archive with a dot, full attendance with flame, and today with an outline", () => {
    expect(dayMark("2026-10-19", archived, completed, "2026-10-23")).toEqual({
      archived: true,
      fullAttendance: true,
      today: false,
    });
    expect(dayMark("2026-10-02", archived, completed, "2026-10-23")).toEqual({
      archived: false,
      fullAttendance: true,
      today: false,
    });
    expect(dayMark("2026-10-23", archived, completed, "2026-10-23")).toEqual({
      archived: false,
      fullAttendance: false,
      today: true,
    });
    expect(dayMark("2026-10-01", archived, completed, "2026-10-23")).toEqual({
      archived: false,
      fullAttendance: false,
      today: false,
    });
  });
});

describe("history default selection", () => {
  it("selects the latest archived day in the loaded month", () => {
    expect(defaultSelectedDate(["2026-10-02", "2026-10-19", "2026-10-04"], "2026-10-23")).toBe("2026-10-19");
  });

  it("selects today when the loaded month has no archive", () => {
    expect(defaultSelectedDate([], "2026-10-23")).toBe("2026-10-23");
    expect(defaultSelectedDate(["not-a-day"], "2026-10-23")).toBe("2026-10-23");
  });

  it("keeps a day the user picked in this month, and recomputes after the month changes", () => {
    expect(resolveSelectedDate("2026-10-04", october, ["2026-10-19"], "2026-10-23")).toBe("2026-10-04");
    expect(resolveSelectedDate("2026-09-02", october, ["2026-10-02", "2026-10-19"], "2026-10-23")).toBe("2026-10-19");
    expect(resolveSelectedDate(null, october, [], "2026-10-23")).toBe("2026-10-23");
    expect(resolveSelectedDate(null, { year: 2026, month: 9 }, [], "2026-10-23")).toBe("2026-09-01");
  });
});

describe("history completion count", () => {
  it("counts completed tasks against the archived list", () => {
    expect(completionCount([{ completed: true }, { completed: false }, { completed: true }])).toEqual({
      done: 2,
      total: 3,
    });
    expect(completionCount([])).toEqual({ done: 0, total: 0 });
  });
});
