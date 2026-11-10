import { describe, expect, it } from "vitest";

import { PLATFORM_APP_ID } from "./constants";
import { paths } from "./paths";

describe("journal paths", () => {
  it("is the user-level journal/main tree from ADR-006, with no athlete id", () => {
    const day = paths.journalDay("alice", "2026-06-08");
    expect(day.split("/")).toEqual([
      "artifacts",
      PLATFORM_APP_ID,
      "users",
      "alice",
      "journal",
      "main",
      "days",
      "2026-06-08",
    ]);
    expect(day.split("/")).toHaveLength(8);
    expect(day.includes("athlete")).toBe(false);
    expect(paths.journalDaysCollection("alice")).toBe(day.slice(0, day.lastIndexOf("/")));
    expect(paths.journalSessionsCollection("alice").split("/")).toEqual([
      "artifacts",
      PLATFORM_APP_ID,
      "users",
      "alice",
      "journal",
      "main",
      "sessions",
    ]);
  });

  it("keeps coach notes beside the day collection, still with no athlete id", () => {
    const note = paths.journalCoachNote("alice", "note-1");
    expect(note.split("/")).toEqual([
      "artifacts",
      PLATFORM_APP_ID,
      "users",
      "alice",
      "journal",
      "main",
      "coachNotes",
      "note-1",
    ]);
    expect(note.split("/")).toHaveLength(8);
    expect(note.includes("athlete")).toBe(false);
    expect(paths.journalCoachNotesCollection("alice")).toBe(note.slice(0, note.lastIndexOf("/")));
  });

  it("keeps body status beside the day collection, still with no athlete id", () => {
    const status = paths.journalBodyStatus("alice", "status-1");
    expect(status.split("/")).toEqual([
      "artifacts",
      PLATFORM_APP_ID,
      "users",
      "alice",
      "journal",
      "main",
      "bodyStatus",
      "status-1",
    ]);
    expect(status.split("/")).toHaveLength(8);
    expect(status.includes("athlete")).toBe(false);
    expect(paths.journalBodyStatusCollection("alice")).toBe(status.slice(0, status.lastIndexOf("/")));
  });

  it("keeps a weekly review beside the day collection, still with no athlete id", () => {
    const review = paths.journalWeeklyReview("alice", "2026-11-09");
    expect(review.split("/")).toEqual([
      "artifacts",
      PLATFORM_APP_ID,
      "users",
      "alice",
      "journal",
      "main",
      "weeklyReviews",
      "2026-11-09",
    ]);
    expect(review.split("/")).toHaveLength(8);
    expect(review.includes("athlete")).toBe(false);
    expect(paths.journalWeeklyReviewsCollection("alice")).toBe(review.slice(0, review.lastIndexOf("/")));
  });
});
