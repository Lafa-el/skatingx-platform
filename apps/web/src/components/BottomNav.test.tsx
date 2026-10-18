// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";

import { BottomNav } from "./BottomNav";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  locale.current = "zh";
});

describe("BottomNav", () => {
  it("flag off (Chinese): shows AI 教练 and no Race Day tab", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    renderAt("/dashboard");
    expect(screen.getByRole("link", { name: "AI 教练" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "比赛日" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("flag on (Chinese): Race Day tab replaces AI Coach", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    renderAt("/dashboard");
    const link = screen.getByRole("link", { name: "比赛日" });
    expect(link.getAttribute("href")).toBe("/race-day");
    expect(screen.queryByRole("link", { name: "AI 教练" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("flag on (English): the tab label is localized", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    locale.current = "en";
    renderAt("/dashboard");
    expect(screen.getByRole("link", { name: "Race Day" })).toBeTruthy();
  });

  it("shows every tab in Chinese, and none of the English labels", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    renderAt("/dashboard");
    const names = screen.getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["总览", "训练", "分析", "AI 教练", "设置"]);
  });

  it("shows every tab in English, and no Chinese", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    locale.current = "en";
    renderAt("/dashboard");
    const names = screen.getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["Dashboard", "Training", "Analysis", "AI Coach", "Settings"]);
  });

  it("names the navigation landmark in the active language", () => {
    renderAt("/dashboard");
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeTruthy();
  });

  it("names the navigation landmark in English", () => {
    locale.current = "en";
    renderAt("/dashboard");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });

  it("the tabs lead to the same places in either language", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    renderAt("/dashboard");
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard",
      "/training",
      "/analysis",
      "/ai-coach",
      "/settings",
    ]);
  });

  it("the Race Day tab stays active on its sub-pages", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    renderAt("/race-day/schedule");
    expect(screen.getByRole("link", { name: "比赛日" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "总览" }).getAttribute("aria-current")).toBeNull();
  });

  it("any value other than 'true' keeps the flag off", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "1");
    renderAt("/dashboard");
    expect(screen.queryByRole("link", { name: "比赛日" })).toBeNull();
  });

  it("the selected tab is navy text with a flame bar and a flame icon, and meets the touch size", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    const { container } = render(
      <MemoryRouter initialEntries={["/training/tasks"]}>
        <BottomNav />
      </MemoryRouter>,
    );
    const current = screen.getByRole("link", { name: "训练" });
    expect(current.className).toContain("text-brand-navy");
    expect(current.className).toContain("before:bg-brand-flame");
    expect(current.querySelector("svg")?.getAttribute("class")).toContain("text-brand-flame");
    expect(screen.getByRole("link", { name: "分析" }).querySelector("svg")?.getAttribute("class")).not.toContain("text-brand-flame");
    expect(controlsBelowTapTarget(container)).toEqual([]);
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
