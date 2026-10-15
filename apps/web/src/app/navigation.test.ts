import { describe, expect, it } from "vitest";

import { getPrimaryNav, isNavActive } from "./navigation";

// The pre-Race-Day bottom navigation, written out literally. With the flag off the app must
// match it exactly: that is the rollback guarantee in ADR-001 D3.
const LEGACY_NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/training", label: "Training", matchPrefix: true },
  { to: "/analysis", label: "Analysis", matchPrefix: true },
  { to: "/ai-coach", label: "AI Coach" },
  { to: "/settings", label: "Settings" },
];

describe("getPrimaryNav", () => {
  it("flag off: identical to the previous navigation", () => {
    expect(getPrimaryNav({ raceDay: false, raceDayLabel: "ignored" })).toEqual(LEGACY_NAV);
  });

  it("flag on: Race Day replaces AI Coach in the same position", () => {
    const nav = getPrimaryNav({ raceDay: true, raceDayLabel: "比赛日" });
    expect(nav).toHaveLength(LEGACY_NAV.length);
    expect(nav[3]).toEqual({ to: "/race-day", label: "比赛日", matchPrefix: true });
    expect(nav.map((i) => i.to)).not.toContain("/ai-coach");
    // Every other tab is untouched.
    expect(nav.filter((_, i) => i !== 3)).toEqual(LEGACY_NAV.filter((_, i) => i !== 3));
  });

  it("uses the label it is given, so the tab text can be localized", () => {
    expect(getPrimaryNav({ raceDay: true, raceDayLabel: "Race Day" })[3]?.label).toBe("Race Day");
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
