// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

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
  it("flag off: shows AI Coach and no Race Day tab", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    renderAt("/dashboard");
    expect(screen.getByRole("link", { name: "AI Coach" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "比赛日" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("flag on (Chinese): Race Day tab replaces AI Coach", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    renderAt("/dashboard");
    const link = screen.getByRole("link", { name: "比赛日" });
    expect(link.getAttribute("href")).toBe("/race-day");
    expect(screen.queryByRole("link", { name: "AI Coach" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("flag on (English): the tab label is localized", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    locale.current = "en";
    renderAt("/dashboard");
    expect(screen.getByRole("link", { name: "Race Day" })).toBeTruthy();
  });

  it("the Race Day tab stays active on its sub-pages", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    renderAt("/race-day/schedule");
    expect(screen.getByRole("link", { name: "比赛日" }).className).toContain("text-sky-700");
    expect(screen.getByRole("link", { name: "Dashboard" }).className).not.toContain("text-sky-700");
  });

  it("any value other than 'true' keeps the flag off", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "1");
    renderAt("/dashboard");
    expect(screen.queryByRole("link", { name: "比赛日" })).toBeNull();
  });
});
