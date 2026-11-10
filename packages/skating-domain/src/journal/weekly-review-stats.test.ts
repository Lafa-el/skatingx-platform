import { describe, expect, it } from "vitest";

import { deriveWeeklyReviewStats, type WeeklyReviewStatsInput } from "./weekly-review-stats";

const WEEK = "2026-06-08";
const PRESET = ["start", "500m", "edges", "endurance"];

function stats(input: Partial<WeeklyReviewStatsInput> & Pick<WeeklyReviewStatsInput, "sessions" | "days" | "notes" | "distances">) {
  return deriveWeeklyReviewStats({
    weekStart: WEEK,
    presetOrder: PRESET,
    ...input,
  });
}

describe("deriveWeeklyReviewStats", () => {
  it("counts Sunday in this week and leaves out next Monday", () => {
    const result = stats({
      days: [{ date: "2026-06-14" }, { date: "2026-06-15" }],
      sessions: [
        { date: "2026-06-14", sessionType: "ice" },
        { date: "2026-06-15", sessionType: "ice" },
      ],
      notes: [],
      distances: [],
    });
    expect(result.trainingDays).toBe(1);
    expect(result.iceCount).toBe(1);
    expect(result.totalSessions).toBe(1);
  });

  it("counts a shared date once", () => {
    const result = stats({
      days: [{ date: "2026-06-08" }, { date: "2026-06-09" }],
      sessions: [{ date: "2026-06-08", sessionType: "ice" }],
      notes: [],
      distances: [],
    });
    expect(result.trainingDays).toBe(2);
  });

  it("counts ice, dryland, and private lessons apart from the other types, and sums minutes", () => {
    const result = stats({
      days: [],
      sessions: [
        { date: "2026-06-08", sessionType: "ice", durationMinutes: 60 },
        { date: "2026-06-09", sessionType: "dryland", durationMinutes: 20 },
        { date: "2026-06-10", sessionType: "private_lesson", durationMinutes: 30 },
        { date: "2026-06-11", sessionType: "competition", durationMinutes: 0 },
        { date: "2026-06-12", sessionType: "recovery" },
        { date: "2026-06-13", sessionType: "rest", durationMinutes: 15 },
      ],
      notes: [],
      distances: [],
    });
    expect(result.iceCount).toBe(1);
    expect(result.drylandCount).toBe(1);
    expect(result.privateLessonCount).toBe(1);
    expect(result.totalSessions).toBe(6);
    expect(result.totalMinutes).toBe(125);
  });

  it("ranks focus by count then preset order, and does not count session notes", () => {
    const result = stats({
      days: [],
      sessions: [
        { date: "2026-06-08", focusTags: ["start", "edges"], notes: "start", technicalFocus: "入弯" },
        { date: "2026-06-09", focusTags: ["start"], technicalFocus: "入弯", notes: "完全不该算" },
        { date: "2026-06-10", focusTags: ["endurance", "footwork"] },
      ],
      notes: [{ date: "2026-06-08", priority: "high", note: "看刃", technicalTags: ["edges", "500m"] }],
      distances: [],
    });
    expect(result.focusTop).toEqual([
      { label: "start", count: 2 },
      { label: "edges", count: 2 },
      { label: "入弯", count: 2 },
      { label: "500m", count: 1 },
      { label: "endurance", count: 1 },
    ]);
    expect(result.focusTop.map((item) => item.label)).not.toContain("完全不该算");
    expect(result.focusTop.map((item) => item.label)).not.toContain("footwork");
  });

  it("orders coach notes by priority before date and keeps five", () => {
    const result = stats({
      days: [],
      sessions: [],
      notes: [
        { date: "2026-06-08", priority: "high", coachName: "李", note: "早" },
        { date: "2026-06-10", priority: "high", note: "晚" },
        { date: "2026-06-14", priority: "low", note: "低但新" },
        { date: "2026-06-09", priority: "medium", note: "中1" },
        { date: "2026-06-12", priority: "medium", note: "中2" },
        { date: "2026-06-11", priority: "low", note: "低" },
        { date: "2026-06-15", priority: "high", note: "下周" },
      ],
      distances: [],
    });
    expect(result.notesTop.map((note) => note.note)).toEqual(["晚", "早", "中2", "中1", "低但新"]);
    expect(result.notesTop[1]?.coachName).toBe("李");
  });

  it("keeps the shortest in-week time for each distance", () => {
    const result = stats({
      days: [],
      sessions: [],
      notes: [],
      distances: [
        {
          distanceId: "500m",
          label: "500m",
          entries: [
            { date: "2026-06-08", timeSeconds: 50 },
            { date: "2026-06-14", timeSeconds: 45.2 },
            { date: "2026-06-15", timeSeconds: 40 },
          ],
        },
        {
          distanceId: "1000m",
          label: "1000m",
          entries: [{ date: "2026-06-15", timeSeconds: 90 }],
        },
      ],
    });
    expect(result.bestTimes).toEqual([{ distanceId: "500m", label: "500m", timeSeconds: 45.2 }]);
  });
});
