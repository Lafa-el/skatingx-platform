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
});
