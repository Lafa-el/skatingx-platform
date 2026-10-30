import { PLAN_DAYS } from "@skatingx/skating-domain";
import { describe, expect, it } from "vitest";

import { planResources } from "@/shared/i18n/plan-messages";

import { PLAN_DAY_ENTRIES, PLAN_SURFACE_LABEL } from "./plan-day-entries";

const MIN_PER_DAY = 3;
const MAX_PER_DAY = 5;

describe("plan day entries", () => {
  it("cover exactly the 21 template days", () => {
    expect(Object.keys(PLAN_DAY_ENTRIES).sort()).toEqual(PLAN_DAYS.map((day) => day.id).sort());
  });

  it("have 3 to 5 entries a day, so one day cannot out-earn the others by length", () => {
    for (const [dayId, entries] of Object.entries(PLAN_DAY_ENTRIES)) {
      expect(entries.length, dayId).toBeGreaterThanOrEqual(MIN_PER_DAY);
      expect(entries.length, dayId).toBeLessThanOrEqual(MAX_PER_DAY);
    }
  });

  it("have ids that are unique across all days, take the form <day>.<n> and number from 1", () => {
    const ids = Object.values(PLAN_DAY_ENTRIES).flatMap((entries) => entries.map((entry) => entry.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const [dayId, entries] of Object.entries(PLAN_DAY_ENTRIES)) {
      expect(entries.map((entry) => entry.id), dayId).toEqual(entries.map((_, index) => `${dayId}.${index + 1}`));
    }
  });

  it("generate something every day except the three Sundays, which only show", () => {
    const withoutTasks = Object.entries(PLAN_DAY_ENTRIES)
      .filter(([, entries]) => entries.every((entry) => entry.generate === false))
      .map(([dayId]) => dayId)
      .sort();
    expect(withoutTasks).toEqual(["jd_race_sun", "jd_speed_sun", "jd_tech_sun"]);
  });

  it("name every entry in both languages, and a target only when there is one", () => {
    const zh = planResources.zh as Record<string, string>;
    const en = planResources.en as Record<string, string>;
    const surfaces = new Set<string>();
    for (const entries of Object.values(PLAN_DAY_ENTRIES)) {
      for (const entry of entries) {
        surfaces.add(entry.surface);
        for (const key of [entry.nameKey, ...(entry.targetKey ? [entry.targetKey] : [])]) {
          expect(zh[key]?.trim(), key).toBeTruthy();
          expect(en[key]?.trim(), key).toBeTruthy();
        }
      }
    }
    for (const surface of surfaces) {
      const key = PLAN_SURFACE_LABEL[surface as keyof typeof PLAN_SURFACE_LABEL];
      expect(zh[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    }
  });

  it("do not leave stray keys: every plan.<focus>.<day>.tN key belongs to an entry", () => {
    const used = new Set(
      Object.values(PLAN_DAY_ENTRIES).flatMap((entries) => entries.flatMap((e) => [e.nameKey, ...(e.targetKey ? [e.targetKey] : [])])),
    );
    const entryKeys = Object.keys(planResources.zh).filter((key) => /^plan\.[a-z]+\.[a-z]{3}\.t\d+\./.test(key));
    expect(entryKeys.sort()).toEqual([...used].sort());
  });
});
