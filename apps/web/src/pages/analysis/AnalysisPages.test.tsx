// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { AnalysisBiomechanicsPage } from "./AnalysisBiomechanicsPage";
import { AnalysisEquipmentPage } from "./AnalysisEquipmentPage";
import { AnalysisHubPage } from "./AnalysisHubPage";
import { AnalysisPacingPage } from "./AnalysisPacingPage";

const state = vi.hoisted(() => ({ locale: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));

afterEach(() => {
  state.locale = "zh";
});

// These pages are placeholders: the text must say no more than that. "Biomechanics" is "动作分析"
// in Chinese (owner decision 2026-10-16, ADR-004 glossary): "生物力学" would claim more than a
// placeholder does. English is the wording the pages had before they were translated.
const PLACEHOLDER = {
  zh: "占位页面:原有功能将在后续阶段迁移。",
  en: "Placeholder page — legacy logic will be migrated in a later phase.",
};

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
      en: "Biomechanics lab, pacing charts, and equipment tracking.",
    },
  },
  {
    name: "biomechanics",
    page: () => <AnalysisBiomechanicsPage />,
    title: { zh: "分析 · 动作分析", en: "Analysis · Biomechanics" },
    note: PLACEHOLDER,
  },
  {
    name: "pacing",
    page: () => <AnalysisPacingPage />,
    title: { zh: "分析 · 配速", en: "Analysis · Pacing" },
    note: PLACEHOLDER,
  },
  {
    name: "equipment",
    page: () => <AnalysisEquipmentPage />,
    title: { zh: "分析 · 装备", en: "Analysis · Equipment" },
    note: PLACEHOLDER,
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
  it("Chinese never says 生物力学 on a placeholder page", () => {
    for (const { page } of PAGES) {
      state.locale = "zh";
      const view = render(page());
      expect(view.container.textContent).not.toContain("生物力学");
      view.unmount();
    }
  });
});
