import { describe, expect, it } from "vitest";

import { PLATFORM_APP_ID } from "./constants";
import { paths } from "./paths";

describe("analysis record path", () => {
  it("is the user-level 6-segment document from ADR-005, not the unused session path", () => {
    const record = paths.analysisRecord("alice", "pace-500-abc");
    expect(record.split("/")).toEqual([
      "artifacts",
      PLATFORM_APP_ID,
      "users",
      "alice",
      "analyses",
      "pace-500-abc",
    ]);
    expect(record.split("/")).toHaveLength(6);
    expect(paths.analysisSession("alice", "lindsay", "s1")).not.toBe(record);
    expect(paths.analysesCollection("alice")).toBe(record.slice(0, record.lastIndexOf("/")));
  });
});
