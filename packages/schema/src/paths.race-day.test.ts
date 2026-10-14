import { describe, expect, it } from "vitest";

import { PLATFORM_APP_ID } from "./constants";
import { paths } from "./paths";

// Firestore document paths have an even number of segments, collection paths an odd number.
// A wrong count only fails at runtime against Firestore, so it is pinned here.

const segments = (path: string) => path.split("/").length;
const U = "u1";
const E = "e1";

describe("race day paths", () => {
  const docs = {
    event: paths.raceDayEvent(U, E),
    roster: paths.raceDayRoster(U, E, "r1"),
    race: paths.raceDayRace(U, E, "x1"),
    result: paths.raceDayResult(U, E, "x1_r1"),
    video: paths.raceDayVideo(U, E, "v1"),
    summary: paths.raceDaySummary(U, E),
  };
  const collections = {
    events: paths.raceDayEventsCollection(U),
    roster: paths.raceDayRosterCollection(U, E),
    races: paths.raceDayRacesCollection(U, E),
    results: paths.raceDayResultsCollection(U, E),
    videos: paths.raceDayVideosCollection(U, E),
  };

  it.each(Object.entries(docs))("document path %s has an even segment count", (_n, p) => {
    expect(segments(p) % 2).toBe(0);
  });

  it.each(Object.entries(collections))(
    "collection path %s has an odd segment count",
    (_n, p) => {
      expect(segments(p) % 2).toBe(1);
    },
  );

  it("keeps every path under the owning user's subtree (ADR-001 D1)", () => {
    const prefix = `artifacts/${PLATFORM_APP_ID}/users/${U}/raceDay`;
    for (const p of [...Object.values(docs), ...Object.values(collections)]) {
      expect(p.startsWith(prefix)).toBe(true);
    }
  });

  it("pins the documented layout", () => {
    expect(docs.event).toBe("artifacts/skatingx-production/users/u1/raceDay/e1");
    expect(docs.result).toBe(
      "artifacts/skatingx-production/users/u1/raceDay/e1/results/x1_r1",
    );
    expect(docs.summary).toBe(
      "artifacts/skatingx-production/users/u1/raceDay/e1/summaries/main",
    );
  });

  it("each collection path is the parent of its document path", () => {
    expect(docs.roster.startsWith(`${collections.roster}/`)).toBe(true);
    expect(docs.race.startsWith(`${collections.races}/`)).toBe(true);
    expect(docs.result.startsWith(`${collections.results}/`)).toBe(true);
    expect(docs.video.startsWith(`${collections.videos}/`)).toBe(true);
    expect(docs.event.startsWith(`${collections.events}/`)).toBe(true);
  });
});
