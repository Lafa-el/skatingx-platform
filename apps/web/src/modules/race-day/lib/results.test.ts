import type { RaceEntry, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import {
  buildResultViews,
  EMPTY_RESULT_FORM,
  formValuesToInput,
  resultIdFor,
  resultToFormValues,
} from "./results";

const base = {
  verification: "pending" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1 as const,
  createdAt: "2026-10-24T10:00:00.000Z",
};

const race = (raceId: string, sortOrder: number, rosterIds: string[]): RaceEntry => ({
  ...base,
  updatedAt: base.createdAt,
  raceId,
  distanceId: "500m",
  label: "500m",
  sortOrder,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds,
});

const athlete = (rosterId: string): RaceRosterEntry => ({
  ...base,
  updatedAt: base.createdAt,
  rosterId,
  displayName: rosterId,
  bib: "0",
  division: "d",
  isSelf: false,
  isFollowed: true,
  athleteRefId: null,
});

const result = (raceId: string, rosterId: string, updatedAt: string, over: Partial<RaceResult> = {}): RaceResult => ({
  ...base,
  updatedAt,
  resultId: `${raceId}_${rosterId}`,
  raceId,
  rosterId,
  status: "finished",
  timeSeconds: 49.8,
  place: null,
  advanced: null,
  ...over,
});

describe("buildResultViews", () => {
  const races = [race("race-2", 2, ["sk-a"]), race("race-1", 1, ["sk-a", "sk-b"])];
  const roster = [athlete("sk-a"), athlete("sk-b")];

  it("puts the most recently changed result first, with a stable order for ties", () => {
    const views = buildResultViews(
      [
        result("race-1", "sk-a", "2026-10-24T12:00:00.000Z"),
        result("race-1", "sk-b", "2026-10-24T13:00:00.000Z"),
        result("race-2", "sk-a", "2026-10-24T12:00:00.000Z"),
      ],
      races,
      roster,
    );
    expect(views.map((v) => v.result.resultId)).toEqual(["race-1_sk-b", "race-1_sk-a", "race-2_sk-a"]);
  });

  it("numbers races by schedule position, not by creation order", () => {
    const views = buildResultViews([result("race-2", "sk-a", base.createdAt)], races, roster);
    expect(views[0]).toMatchObject({ raceNumber: 2, race: { raceId: "race-2" } });
    expect(buildResultViews([result("race-1", "sk-a", base.createdAt)], races, roster)[0]?.raceNumber).toBe(1);
  });

  it("keeps a result whose athlete was taken off the race, and says so", () => {
    const [view] = buildResultViews(
      [result("race-2", "sk-b", base.createdAt)],
      races,
      roster,
    );
    expect(view).toMatchObject({ athleteInRace: false, athlete: { rosterId: "sk-b" } });
  });

  it("marks an athlete that is on the race as in it", () => {
    expect(buildResultViews([result("race-1", "sk-b", base.createdAt)], races, roster)[0]?.athleteInRace).toBe(true);
  });

  it("does not drop results that point at an unknown race or athlete", () => {
    const [view] = buildResultViews([result("race-9", "sk-z", base.createdAt)], races, roster);
    expect(view).toMatchObject({ race: null, raceNumber: null, athlete: null, athleteInRace: false });
  });
});

describe("resultIdFor", () => {
  it("matches the repository id and is null until both are chosen", () => {
    expect(resultIdFor("race-1", "sk-a")).toBe("race-1_sk-a");
    expect(resultIdFor("", "sk-a")).toBeNull();
    expect(resultIdFor("race-1", "")).toBeNull();
    expect(resultIdFor("Bad_Race", "sk-a")).toBeNull();
  });
});

describe("form values", () => {
  it("starts as a finished result with nothing filled in", () => {
    expect(EMPTY_RESULT_FORM).toEqual({ status: "finished", time: "", place: "", advanced: "", sourceNote: "" });
    expect(resultToFormValues(undefined)).toEqual(EMPTY_RESULT_FORM);
  });

  it("shows a stored result the way it can be typed back in, including the third decimal", () => {
    expect(
      resultToFormValues(result("race-1", "sk-a", base.createdAt, { timeSeconds: 104.231, place: 2, advanced: false, sourceNote: "n" })),
    ).toEqual({ status: "finished", time: "1:44.231", place: "2", advanced: "no", sourceNote: "n" });
    expect(resultToFormValues(result("race-1", "sk-a", base.createdAt, { timeSeconds: 49.8, advanced: true })).time).toBe(
      "49.80",
    );
    expect(
      resultToFormValues(result("race-1", "sk-a", base.createdAt, { status: "DNS", timeSeconds: null })),
    ).toMatchObject({ status: "DNS", time: "", place: "", advanced: "" });
  });

  it("sends time, place and advancement only for a finished race", () => {
    const values = { status: "finished", time: "49.8", place: "1", advanced: "yes" as const, sourceNote: "x" };
    expect(formValuesToInput(values)).toEqual({ status: "finished", time: "49.8", place: "1", advanced: true, sourceNote: "x" });
    expect(formValuesToInput({ ...values, advanced: "no" }).advanced).toBe(false);
    expect(formValuesToInput({ ...values, advanced: "" }).advanced).toBeNull();
    expect(formValuesToInput({ ...values, status: "DNF" })).toEqual({
      status: "DNF",
      time: "",
      place: "",
      advanced: null,
      sourceNote: "x",
    });
  });
});
