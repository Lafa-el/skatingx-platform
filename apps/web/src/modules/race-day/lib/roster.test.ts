import type { RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import { sortRosterEntries } from "./roster";

function entry(over: Partial<RaceRosterEntry>): RaceRosterEntry {
  return {
    rosterId: "r",
    displayName: "N",
    bib: "1",
    division: "D",
    isSelf: false,
    isFollowed: false,
    athleteRefId: null,
    verification: "pending",
    source: "manual",
    sourceNote: "",
    verifiedAt: null,
    schemaVersion: 1,
    ...over,
  };
}

describe("sortRosterEntries", () => {
  it("puts the user's own athlete first, then followed, then the rest", () => {
    const sorted = sortRosterEntries(
      [
        entry({ rosterId: "a", displayName: "Amy" }),
        entry({ rosterId: "f", displayName: "Zed", isFollowed: true }),
        entry({ rosterId: "s", displayName: "Yan", isSelf: true }),
      ],
      "en",
    );
    expect(sorted.map((e) => e.rosterId)).toEqual(["s", "f", "a"]);
  });

  it("orders by name within a group and by id when names are equal", () => {
    const sorted = sortRosterEntries(
      [
        entry({ rosterId: "2", displayName: "Bo" }),
        entry({ rosterId: "1", displayName: "Bo" }),
        entry({ rosterId: "3", displayName: "Al" }),
      ],
      "en",
    );
    expect(sorted.map((e) => e.rosterId)).toEqual(["3", "1", "2"]);
  });

  it("does not mutate its input", () => {
    const input = [entry({ rosterId: "b", displayName: "B" }), entry({ rosterId: "a", displayName: "A" })];
    sortRosterEntries(input, "en");
    expect(input.map((e) => e.rosterId)).toEqual(["b", "a"]);
  });
});
