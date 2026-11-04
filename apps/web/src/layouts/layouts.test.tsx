// @vitest-environment happy-dom
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/dom";

import { AnalysisLayout } from "./AnalysisLayout";
import { TrainingLayout } from "./TrainingLayout";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  athleteId: "lindsay" as string | null,
}));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
// These tests are about the section tabs. The analysis gate stays unlocked so the outlet still mounts.
vi.mock("@/hooks/useIsPro", () => ({
  useIsPro: () => ({ isPro: true, loading: false, error: null, language: state.locale, settings: null }),
}));
// The header and the two main bars have their own tests; here only the section navigation is under test.
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => null }));
vi.mock("@/components/SideNav", () => ({ SideNav: () => null }));
vi.mock("@/hooks/firestore", () => ({
  useActiveAthlete: () => ({ athleteId: state.athleteId, loading: false, error: null }),
}));

afterEach(() => {
  state.locale = "zh";
  state.athleteId = "lindsay";
});

function renderLayout(path: string, layout: React.ReactElement) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={layout}>
          <Route index element={<p>page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("TrainingLayout", () => {
  it("Chinese: the sections are named and labeled in Chinese", () => {
    renderLayout("/training", <TrainingLayout />);
    const nav = screen.getByRole("navigation", { name: "训练分区" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "首页",
      "计划",
      "任务",
      "历史",
      "学院",
      "纪录",
      "商店",
    ]);
  });

  it("English: the previous labels and a descriptive landmark name", () => {
    state.locale = "en";
    renderLayout("/training", <TrainingLayout />);
    const nav = screen.getByRole("navigation", { name: "Training sections" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Home",
      "Plan",
      "Tasks",
      "History",
      "Academy",
      "Records",
      "Shop",
    ]);
  });

  it("the tabs lead to the same places in either language", () => {
    for (const locale of ["zh", "en"] as const) {
      state.locale = locale;
      const { unmount } = render(
        <MemoryRouter initialEntries={["/training"]}>
          <Routes>
            <Route path="/training" element={<TrainingLayout />}>
              <Route index element={<p>page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
      const nav = screen.getByRole("navigation");
      expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
        "/training",
        "/training/plan",
        "/training/tasks",
        "/training/history",
        "/training/academy",
        "/training/records",
        "/training/shop",
      ]);
      unmount();
    }
  });
});

describe("layouts with no current athlete", () => {
  it("shows the empty notice in Chinese and does not mount the page", () => {
    state.athleteId = null;
    renderLayout("/training", <TrainingLayout />);
    expect(screen.getByText("还没有运动员")).toBeTruthy();
    expect(screen.queryByText("page")).toBeNull();
  });

  it("shows the empty notice in English on the analysis layout", () => {
    state.locale = "en";
    state.athleteId = null;
    renderLayout("/analysis", <AnalysisLayout />);
    expect(screen.getByText("No athlete yet")).toBeTruthy();
    expect(screen.queryByText("page")).toBeNull();
  });
});

describe("AnalysisLayout", () => {
  it("Chinese: the sections are named and labeled in Chinese", () => {
    renderLayout("/analysis", <AnalysisLayout />);
    const nav = screen.getByRole("navigation", { name: "分析分区" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "首页",
      "动作分析",
      "配速",
      "装备",
    ]);
  });

  it("English: the previous labels and a descriptive landmark name", () => {
    state.locale = "en";
    renderLayout("/analysis", <AnalysisLayout />);
    const nav = screen.getByRole("navigation", { name: "Analysis sections" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Hub",
      "Biomechanics",
      "Pacing",
      "Equipment",
    ]);
  });
});
