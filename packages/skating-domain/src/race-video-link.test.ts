import { describe, expect, it } from "vitest";

import { parseRaceVideoLink, raceVideoAnalysisHref } from "./race-video-link";

describe("raceVideoAnalysisHref", () => {
  it("builds the link from the two ids and nothing else", () => {
    expect(raceVideoAnalysisHref("2026-buffalo-rpm6w8", "1000m-final-a-xufrl8")).toBe(
      "/analysis/biomechanics?raceVideo=2026-buffalo-rpm6w8.1000m-final-a-xufrl8",
    );
  });

  it("returns null for ids that could not be parsed back", () => {
    expect(raceVideoAnalysisHref("a.b", "c")).toBeNull();
    expect(raceVideoAnalysisHref("a", "")).toBeNull();
    expect(raceVideoAnalysisHref("A", "b")).toBeNull();
  });
});

describe("parseRaceVideoLink", () => {
  it("round-trips what the builder makes", () => {
    const href = raceVideoAnalysisHref("event-1", "video-9") ?? "";
    const raw = new URL(href, "https://example.test").searchParams.get("raceVideo");
    expect(parseRaceVideoLink(raw)).toEqual({ eventId: "event-1", videoId: "video-9" });
  });

  it.each([
    ["missing", null],
    ["undefined", undefined],
    ["empty", ""],
    ["no dot", "event-1"],
    ["two dots", "a.b.c"],
    ["empty event", ".video"],
    ["empty video", "event."],
    ["uppercase", "Event.video"],
    ["underscore", "event_1.video"],
    ["space", "event 1.video"],
    ["slash", "event/../x.video"],
    ["leading hyphen", "-event.video"],
    ["too long", `${"a".repeat(65)}.video`],
  ])("returns null for %s", (_name, raw) => {
    expect(parseRaceVideoLink(raw)).toBeNull();
  });

  it("accepts ids at the length limit", () => {
    const id = "a".repeat(64);
    expect(parseRaceVideoLink(`${id}.${id}`)).toEqual({ eventId: id, videoId: id });
  });
});
