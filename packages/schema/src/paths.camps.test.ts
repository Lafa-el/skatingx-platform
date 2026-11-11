import { describe, expect, it } from "vitest";

import { PLATFORM_APP_ID } from "./constants";
import { paths } from "./paths";

describe("camp paths", () => {
  it("is a user-level camps collection, six segments, with no athlete id", () => {
    const camp = paths.camp("alice", "camp-1");
    expect(camp.split("/")).toEqual(["artifacts", PLATFORM_APP_ID, "users", "alice", "camps", "camp-1"]);
    expect(camp.split("/")).toHaveLength(6);
    expect(camp.includes("athlete")).toBe(false);
    expect(paths.campsCollection("alice")).toBe(camp.slice(0, camp.lastIndexOf("/")));
  });
});
