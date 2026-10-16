// @vitest-environment happy-dom
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";

import RaceDayModule from "./RaceDayModule";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

// Header and BottomNav need the Firebase-backed providers; they have their own tests.
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => null }));
// The Setup page needs Firebase-backed providers; it has its own tests.
vi.mock("./pages/SetupPage", () => ({ SetupPage: () => <h1>设置</h1> }));
vi.mock("./pages/SchedulePage", () => ({ SchedulePage: () => <h1>赛程</h1> }));
vi.mock("./pages/ResultsPage", () => ({ ResultsPage: () => <h1>成绩</h1> }));
vi.mock("./pages/VideosPage", () => ({ VideosPage: () => <h1>视频</h1> }));
vi.mock("./pages/SummaryPage", () => ({ SummaryPage: () => <h1>总结</h1> }));
vi.mock("./pages/TodayPage", () => ({ TodayPage: () => <h1>今天</h1> }));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/race-day/*" element={<RaceDayModule />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  locale.current = "zh";
});

const TABS_ZH = ["今天", "赛程", "成绩", "视频", "总结", "设置"];

describe("RaceDayModule", () => {
  it("shows the section navigation with every tab, in Chinese by default", () => {
    renderAt("/race-day");
    const nav = screen.getByRole("navigation", { name: "比赛日分区" });
    expect(Array.from(nav.querySelectorAll("a")).map((a) => a.textContent)).toEqual(TABS_ZH);
  });

  it("the page body breaks long unbroken text instead of scrolling sideways on a phone", () => {
    renderAt("/race-day");
    expect(document.querySelector("main")?.className).toContain("break-words");
  });

  it("shows the field-test notice that unverified data is marked pending", () => {
    renderAt("/race-day");
    expect(screen.getByText(/待确认/)).toBeTruthy();
  });

  it("the schedule route shows the Schedule page, not the placeholder", () => {
    renderAt("/race-day/schedule");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("赛程");
    expect(screen.queryByText(/尚未开放/)).toBeNull();
  });

  it("the results route shows the Results page, not the placeholder", () => {
    renderAt("/race-day/results");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("成绩");
    expect(screen.queryByText(/尚未开放/)).toBeNull();
  });

  it("the videos route shows the Videos page, not the placeholder", () => {
    renderAt("/race-day/videos");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("视频");
    expect(screen.queryByText(/尚未开放/)).toBeNull();
  });

  it("the summary route shows the Summary page, not the placeholder", () => {
    renderAt("/race-day/summary");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("总结");
    expect(screen.queryByText(/尚未开放/)).toBeNull();
  });

  it("the setup route shows the Setup page under its own heading", () => {
    renderAt("/race-day/setup");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("设置");
    expect(screen.queryByText(/尚未开放/)).toBeNull();
  });

  it("the Today route shows the Today page, not the placeholder", () => {
    renderAt("/race-day");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("今天");
    expect(screen.queryByText(/尚未开放/)).toBeNull();
  });

  it("marks only the current tab, and the Today tab is not active on sub-pages", () => {
    renderAt("/race-day/results");
    expect(screen.getByRole("link", { name: "成绩" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "今天" }).getAttribute("aria-current")).toBeNull();
  });

  it("navigates between tabs with the keyboard-reachable links", async () => {
    const user = userEvent.setup();
    renderAt("/race-day");
    await user.click(screen.getByRole("link", { name: "赛程" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("赛程");
  });

  it("an unknown sub-path falls back to Today instead of a blank page", () => {
    renderAt("/race-day/does-not-exist");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("今天");
  });

  it("English locale: tabs and notice are translated", () => {
    locale.current = "en";
    renderAt("/race-day/schedule");
    const nav = screen.getByRole("navigation", { name: "Race Day sections" });
    expect(Array.from(nav.querySelectorAll("a")).map((a) => a.textContent)).toEqual([
      "Today",
      "Schedule",
      "Results",
      "Videos",
      "Summary",
      "Setup",
    ]);
    expect(screen.getByText(/marked Pending/)).toBeTruthy();
  });
});
