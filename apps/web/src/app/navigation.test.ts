import { describe, expect, it } from "vitest";

import { getAnalysisSubNav, getPrimaryNav, getTrainingSubNav, isNavActive } from "./navigation";

// The pre-Race-Day bottom navigation, written out literally (English). With the flag off the app
// must match it exactly: that is the rollback guarantee in ADR-001 D3. Language changes the label
// only; destinations, order and matching rules stay as they were (ADR-004, S6b).
const LEGACY_NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/training", label: "Training", matchPrefix: true },
  { to: "/analysis", label: "Analysis", matchPrefix: true },
  { to: "/ai-coach", label: "AI Coach" },
  { to: "/settings", label: "Settings" },
];

const LEGACY_TRAINING = [
  { to: "/training", label: "Home" },
  { to: "/training/tasks", label: "Tasks" },
  { to: "/training/academy", label: "Academy" },
  { to: "/training/records", label: "Records" },
  { to: "/training/shop", label: "Shop" },
];

const LEGACY_ANALYSIS = [
  { to: "/analysis", label: "Hub" },
  { to: "/analysis/biomechanics", label: "Biomechanics" },
  { to: "/analysis/pacing", label: "Pacing" },
  { to: "/analysis/equipment", label: "Equipment" },
];

const withoutLabel = <T extends { label: string }>(items: T[]) =>
  items.map(({ label: _label, ...rest }) => rest);

describe("getPrimaryNav", () => {
  it("flag off, English: identical to the previous navigation", () => {
    expect(getPrimaryNav({ raceDay: false, raceDayLabel: "ignored", locale: "en" })).toEqual(LEGACY_NAV);
  });

  it("flag off, Chinese: same destinations and matching, Chinese labels", () => {
    const nav = getPrimaryNav({ raceDay: false, raceDayLabel: "ignored", locale: "zh" });
    expect(withoutLabel(nav)).toEqual(withoutLabel(LEGACY_NAV));
    expect(nav.map((item) => item.label)).toEqual(["总览", "训练", "分析", "AI 教练", "设置"]);
  });

  it("flag on: Race Day replaces AI Coach in the same position, in both languages", () => {
    for (const locale of ["zh", "en"] as const) {
      const nav = getPrimaryNav({ raceDay: true, raceDayLabel: "比赛日", locale });
      expect(nav).toHaveLength(LEGACY_NAV.length);
      expect(nav[3]).toEqual({ to: "/race-day", label: "比赛日", matchPrefix: true });
      expect(nav.map((i) => i.to)).not.toContain("/ai-coach");
      // Every other tab keeps its destination and matching.
      expect(withoutLabel(nav.filter((_, i) => i !== 3))).toEqual(
        withoutLabel(LEGACY_NAV.filter((_, i) => i !== 3)),
      );
    }
  });

  it("uses the label it is given for the Race Day tab, so that text stays in the Race Day resource", () => {
    expect(getPrimaryNav({ raceDay: true, raceDayLabel: "Race Day", locale: "en" })[3]?.label).toBe("Race Day");
  });

  it("every tab has a label that differs between the languages", () => {
    const zh = getPrimaryNav({ raceDay: false, raceDayLabel: "x", locale: "zh" });
    const en = getPrimaryNav({ raceDay: false, raceDayLabel: "x", locale: "en" });
    zh.forEach((item, index) => {
      expect(item.label).not.toBe(en[index]?.label);
    });
  });
});

describe("sub navigation", () => {
  it("Training, English: identical to the previous list", () => {
    expect(getTrainingSubNav("en")).toEqual(LEGACY_TRAINING);
  });

  it("Analysis, English: identical to the previous list", () => {
    expect(getAnalysisSubNav("en")).toEqual(LEGACY_ANALYSIS);
  });

  it("Chinese keeps the same destinations in the same order", () => {
    expect(withoutLabel(getTrainingSubNav("zh"))).toEqual(withoutLabel(LEGACY_TRAINING));
    expect(withoutLabel(getAnalysisSubNav("zh"))).toEqual(withoutLabel(LEGACY_ANALYSIS));
  });

  it("Chinese labels", () => {
    expect(getTrainingSubNav("zh").map((item) => item.label)).toEqual(["首页", "任务", "学院", "纪录", "商店"]);
    expect(getAnalysisSubNav("zh").map((item) => item.label)).toEqual(["首页", "动作分析", "配速", "装备"]);
  });
});

describe("isNavActive for the Race Day tab", () => {
  const item = { to: "/race-day", label: "x", matchPrefix: true };

  it("is active on the section and every sub-page, and not on look-alike paths", () => {
    expect(isNavActive("/race-day", item)).toBe(true);
    expect(isNavActive("/race-day/schedule", item)).toBe(true);
    expect(isNavActive("/race-days", item)).toBe(false);
    expect(isNavActive("/dashboard", item)).toBe(false);
  });
});
