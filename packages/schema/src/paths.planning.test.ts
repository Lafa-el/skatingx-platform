import { describe, expect, it } from "vitest";

import { PLATFORM_APP_ID } from "./constants";
import { paths } from "./paths";

describe("planning check-in path", () => {
  it("is the 10-segment document from ADR-005, not the unused 9-segment helper", () => {
    const record = paths.planningCheckIn("alice", "lindsay", "jd_tech_mon");
    expect(record.split("/")).toEqual([
      "artifacts",
      PLATFORM_APP_ID,
      "users",
      "alice",
      "athletes",
      "lindsay",
      "planning",
      "main",
      "completedTasks",
      "jd_tech_mon",
    ]);
    expect(record.split("/")).toHaveLength(10);
    expect(paths.planningCheckInsCollection("alice", "lindsay").split("/")).toHaveLength(9);
    expect(paths.planningCompletedTask("alice", "lindsay", "jd_tech_mon")).not.toBe(record);
    expect(paths.planningCompletedTask("alice", "lindsay", "jd_tech_mon").split("/")).toHaveLength(9);
  });
});
