import { describe, expect, it } from "vitest";

import { PLATFORM_APP_ID } from "./constants";
import { paths } from "./paths";

describe("video library paths", () => {
  it("is a user-level videos collection, six segments, with no athlete id", () => {
    const entry = paths.videoEntry("alice", "Vid-1");
    expect(entry.split("/")).toEqual(["artifacts", PLATFORM_APP_ID, "users", "alice", "videos", "Vid-1"]);
    expect(entry.split("/")).toHaveLength(6);
    expect(entry.includes("athlete")).toBe(false);
    expect(paths.videoEntriesCollection("alice")).toBe(entry.slice(0, entry.lastIndexOf("/")));
  });
});
