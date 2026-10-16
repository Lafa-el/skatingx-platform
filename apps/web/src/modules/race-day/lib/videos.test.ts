import type { RaceEntry, RaceRosterEntry, RaceVideoRef } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import { buildVideoGroups, formValuesToVideoInput, videoToFormValues } from "./videos";

const audit = {
  schemaVersion: 1 as const,
  createdAt: "2026-10-24T10:00:00.000Z",
  updatedAt: "2026-10-24T10:00:00.000Z",
};
const prov = { verification: "pending" as const, source: "manual" as const, sourceNote: "", verifiedAt: null, ...audit };

const race = (raceId: string, sortOrder: number, label = raceId): RaceEntry => ({
  raceId,
  distanceId: "500m",
  label,
  sortOrder,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: ["ann"],
  ...prov,
});

const ann: RaceRosterEntry = {
  rosterId: "ann",
  displayName: "Ann",
  bib: "7",
  division: "D",
  isSelf: true,
  isFollowed: false,
  athleteRefId: null,
  ...prov,
};

const video = (videoId: string, raceId: string, over: Partial<RaceVideoRef> = {}): RaceVideoRef => ({
  videoId,
  raceId,
  rosterId: "ann",
  label: videoId,
  externalUrl: null,
  storedWhere: null,
  note: null,
  ...audit,
  ...over,
});

describe("buildVideoGroups", () => {
  it("groups by race in schedule order and leaves out races without records", () => {
    const groups = buildVideoGroups(
      [video("v1", "late"), video("v2", "early")],
      [race("late", 2), race("early", 1), race("none", 3)],
      [ann],
    );
    expect(groups.map((g) => [g.race?.raceId, g.raceNumber])).toEqual([
      ["early", 1],
      ["late", 2],
    ]);
  });

  it("allows several records for the same race and athlete, newest change first", () => {
    const groups = buildVideoGroups(
      [
        video("old", "r1", { updatedAt: "2026-10-24T09:00:00.000Z" }),
        video("new", "r1", { updatedAt: "2026-10-24T11:00:00.000Z" }),
      ],
      [race("r1", 1)],
      [ann],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.views.map((v) => v.video.videoId)).toEqual(["new", "old"]);
  });

  it("keeps a record whose race is missing, in a group of its own at the end", () => {
    const groups = buildVideoGroups([video("v1", "gone"), video("v2", "r1")], [race("r1", 1)], [ann]);
    expect(groups.map((g) => g.race?.raceId ?? null)).toEqual(["r1", null]);
    expect(groups[1]?.raceNumber).toBeNull();
  });

  it("joins the athlete, and leaves null for a missing one", () => {
    const groups = buildVideoGroups(
      [video("v1", "r1"), video("v2", "r1", { rosterId: "ghost" })],
      [race("r1", 1)],
      [ann],
    );
    const byId = new Map(groups[0]?.views.map((v) => [v.video.videoId, v.athlete?.displayName ?? null]));
    expect(byId.get("v1")).toBe("Ann");
    expect(byId.get("v2")).toBeNull();
  });

  it("gives a host only for a plain http(s) link", () => {
    const groups = buildVideoGroups(
      [
        video("ok", "r1", { externalUrl: "https://example.com/a/very/long/path?x=1" }),
        video("none", "r1"),
        video("js", "r1", { externalUrl: "javascript:alert(1)" }),
        video("creds", "r1", { externalUrl: "https://user:pw@example.com/" }),
      ],
      [race("r1", 1)],
      [ann],
    );
    const hosts = new Map(groups[0]?.views.map((v) => [v.video.videoId, v.linkHost]));
    expect(hosts.get("ok")).toBe("example.com");
    expect(hosts.get("none")).toBeNull();
    expect(hosts.get("js")).toBeNull();
    expect(hosts.get("creds")).toBeNull();
  });
});

describe("form values", () => {
  it("round-trips a record and turns empty optional fields into null", () => {
    expect(videoToFormValues(undefined)).toEqual({ label: "", externalUrl: "", storedWhere: "", note: "" });
    const values = videoToFormValues(video("v1", "r1", { externalUrl: "https://example.com/", note: "n" }));
    expect(values).toEqual({ label: "v1", externalUrl: "https://example.com/", storedWhere: "", note: "n" });
    expect(formValuesToVideoInput(values)).toEqual({
      label: "v1",
      externalUrl: "https://example.com/",
      storedWhere: null,
      note: "n",
    });
  });

  it("treats whitespace-only optional fields as empty", () => {
    expect(formValuesToVideoInput({ label: "x", externalUrl: "  ", storedWhere: " ", note: "  " })).toEqual({
      label: "x",
      externalUrl: null,
      storedWhere: null,
      note: null,
    });
  });
});
