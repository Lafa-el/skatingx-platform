import { describe, expect, it } from "vitest";

import { deriveCampStats, type CampStatsInput } from "./camp-stats";

const PRESET = ["start_technique", "transitions", "edges", "rotation"];

function input(overrides: Partial<CampStatsInput> = {}): CampStatsInput {
  return {
    campStart: "2026-07-01",
    campEnd: "2026-07-14",
    days: [],
    sessions: [],
    notes: [],
    distances: [],
    presetOrder: PRESET,
    ...overrides,
  };
}

describe("deriveCampStats", () => {
  it("counts both ends of the window and the inclusive day span", () => {
    const stats = deriveCampStats(
      input({
        campStart: "2026-07-01",
        campEnd: "2026-07-03",
        days: [{ date: "2026-06-30" }, { date: "2026-07-01" }, { date: "2026-07-04" }],
        sessions: [
          { date: "2026-07-03", sessionType: "ice", durationMinutes: 10 },
          { date: "2026-07-04", sessionType: "ice", durationMinutes: 99 },
        ],
      }),
    );
    expect(stats.totalCampDays).toBe(3);
    expect(stats.trainingDays).toBe(2);
    expect(stats.totalSessions).toBe(1);
    expect(stats.iceCount).toBe(1);
    expect(deriveCampStats(input({ campStart: "2026-07-01", campEnd: "2026-07-01" })).totalCampDays).toBe(1);
    expect(deriveCampStats(input({ campStart: "2024-02-28", campEnd: "2024-03-01" })).totalCampDays).toBe(3);
    expect(deriveCampStats(input({ campStart: "2026-02-30", campEnd: "2026-03-02" })).totalCampDays).toBe(0);
  });

  it("counts a diary-only day as a training day", () => {
    const stats = deriveCampStats(
      input({
        days: [{ date: "2026-07-02" }],
        notes: [{ date: "2026-07-03", technicalTags: ["edges"] }],
      }),
    );
    expect(stats.trainingDays).toBe(1);
    expect(stats.totalSessions).toBe(0);
  });

  it("counts ice, dryland, and private lessons, and adds every positive duration", () => {
    const stats = deriveCampStats(
      input({
        sessions: [
          { date: "2026-07-01", sessionType: "ice", durationMinutes: 40 },
          { date: "2026-07-02", sessionType: "dryland", durationMinutes: 20 },
          { date: "2026-07-03", sessionType: "private_lesson", durationMinutes: 30 },
          { date: "2026-07-04", sessionType: "competition", durationMinutes: 15 },
          { date: "2026-07-05", sessionType: "recovery", durationMinutes: 0 },
          { date: "2026-07-06", sessionType: "rest", durationMinutes: Number.NaN },
          { date: "2026-07-07", durationMinutes: -5 },
        ],
      }),
    );
    expect(stats.iceCount).toBe(1);
    expect(stats.drylandCount).toBe(1);
    expect(stats.privateLessonCount).toBe(1);
    expect(stats.totalSessions).toBe(7);
    expect(stats.totalMinutes).toBe(105);
    expect(stats.trainingDays).toBe(7);
  });

  it("compares the best time before the camp with the best time inside it", () => {
    const stats = deriveCampStats(
      input({
        distances: [
          {
            distanceId: "500m",
            label: "500m",
            entries: [
              { date: "2026-06-01", timeSeconds: 50 },
              { date: "2026-06-20", timeSeconds: 48 },
              { date: "2026-07-02", timeSeconds: 47 },
              { date: "2026-07-20", timeSeconds: 10 },
              { date: "2026-07-03", timeSeconds: 0 },
              { date: "2026-06-02", timeSeconds: Number.NaN },
            ],
          },
          {
            distanceId: "1000m",
            label: "1000m",
            entries: [
              { date: "2026-06-01", timeSeconds: 90 },
              { date: "2026-07-04", timeSeconds: 95 },
            ],
          },
          {
            distanceId: "1500m",
            label: "1500m",
            entries: [{ date: "2026-07-05", timeSeconds: 140 }],
          },
          {
            distanceId: "333m",
            label: "333m",
            entries: [{ date: "2026-06-01", timeSeconds: 30 }],
          },
          {
            distanceId: "777m",
            label: "777m",
            entries: [{ date: "2026-08-01", timeSeconds: 70 }],
          },
        ],
      }),
    );
    expect(stats.pbChanges).toEqual([
      { distanceId: "500m", label: "500m", before: 48, after: 47, changed: true },
      { distanceId: "1500m", label: "1500m", after: 140, changed: true },
      { distanceId: "1000m", label: "1000m", before: 90, after: 95, changed: false },
      { distanceId: "333m", label: "333m", before: 30, changed: false },
    ]);
  });

  it("keeps the first eight technical issues and ignores session tags", () => {
    const stats = deriveCampStats(
      input({
        presetOrder: [
          "start_technique",
          "transitions",
          "edges",
          "rotation",
          "jump_takeoff",
          "program_flow",
          "spin_centering",
          "exit_angle",
        ],
        sessions: [
          {
            date: "2026-07-01",
            sessionType: "ice",
            focusTags: ["edges", "edges", "edges"],
            technicalFocus: "start_technique",
          },
        ],
        notes: [
          {
            date: "2026-07-02",
            technicalTags: ["mmm", "mmm", "mmm", "edges", "edges", "start_technique", "start_technique"],
          },
          { date: "2026-07-03", technicalTags: ["aaa", "aaa", "zzz", "zzz", "transitions", "rotation"] },
          { date: "2026-06-01", technicalTags: ["edges", "edges", "edges"] },
          { date: "2026-07-04", technicalTags: ["jump_takeoff", "program_flow", "spin_centering", "exit_angle", "  "] },
        ],
      }),
    );
    expect(stats.techIssuesTop).toEqual([
      { label: "mmm", count: 3 },
      { label: "start_technique", count: 2 },
      { label: "edges", count: 2 },
      { label: "aaa", count: 2 },
      { label: "zzz", count: 2 },
      { label: "transitions", count: 1 },
      { label: "rotation", count: 1 },
      { label: "jump_takeoff", count: 1 },
    ]);
  });
});
