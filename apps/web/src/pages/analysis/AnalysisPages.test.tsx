// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { legacyColourClasses } from "@/test/legacyLook";
import { render, screen } from "@/test/dom";

import { AnalysisHubPage } from "./AnalysisHubPage";

const state = vi.hoisted(() => ({ locale: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));

afterEach(() => {
  state.locale = "zh";
});

// The hub is still a placeholder. Biomechanics, pacing, and equipment are ported.
// "生物力学" stays off the hub (owner decision 2026-10-16). The hub English note no longer
// says "Biomechanics lab" (owner approved 2026-10-17).
const PAGES: {
  name: string;
  page: () => ReactElement;
  title: { zh: string; en: string };
  note: { zh: string; en: string };
}[] = [
  {
    name: "hub",
    page: () => <AnalysisHubPage />,
    title: { zh: "分析", en: "Analysis" },
    note: {
      zh: "动作分析、配速图表和装备追踪。",
      en: "Biomechanics, pacing charts, and equipment tracking.",
    },
  },
];

describe.each(["zh", "en"] as const)("analysis pages (%s)", (locale) => {
  it.each(PAGES)("$name: title and note", ({ page, title, note }) => {
    state.locale = locale;
    render(page());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title[locale]);
    expect(screen.getByText(note[locale])).toBeTruthy();
  });
});

describe("analysis pages: wording that must not overclaim", () => {
  it("English does not call a placeholder a lab", () => {
    state.locale = "en";
    const view = render(<AnalysisHubPage />);
    expect(view.container.textContent).not.toMatch(/\blab\b/i);
  });

  it("Chinese never says 生物力学 on a placeholder page", () => {
    for (const { page } of PAGES) {
      state.locale = "zh";
      const view = render(page());
      expect(view.container.textContent).not.toContain("生物力学");
      view.unmount();
    }
  });
});

describe("analysis pages: UI v1 look", () => {
  it.each(PAGES)("$name: no old colour classes, navy heading, note with an icon", ({ page }) => {
    const view = render(page());
    expect(legacyColourClasses(view.container)).toEqual([]);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-brand-navy");
    expect(view.container.querySelector("svg")).not.toBeNull();
  });
});
