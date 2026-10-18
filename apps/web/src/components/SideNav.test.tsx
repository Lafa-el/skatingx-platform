// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";

import { BottomNav } from "./BottomNav";
import { SideNav } from "./SideNav";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

afterEach(() => {
  vi.unstubAllEnvs();
  locale.current = "zh";
});

const linksOf = (root: HTMLElement) =>
  within(root)
    .getAllByRole("link")
    .map((link) => ({ text: link.textContent, href: link.getAttribute("href") }));

function renderAt(path: string, ui = <SideNav />) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

describe("SideNav", () => {
  it("leads to the same places, with the same words, as the bottom bar (Chinese and English)", () => {
    for (const language of ["zh", "en"] as const) {
      for (const flag of ["", "true"]) {
        locale.current = language;
        vi.stubEnv("VITE_FEATURE_RACE_DAY", flag);
        const side = renderAt("/dashboard");
        const sideNav = screen.getByRole("navigation");
        const fromSide = linksOf(sideNav).filter((l) => l.href !== "/dashboard" || l.text !== "SkatingX");
        side.unmount();
        const bottom = renderAt("/dashboard", <BottomNav />);
        const fromBottom = linksOf(screen.getByRole("navigation"));
        bottom.unmount();
        expect(fromSide).toEqual(fromBottom);
      }
    }
  });

  it("names the landmark in the active language", () => {
    renderAt("/dashboard");
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeTruthy();
  });

  it("English: the landmark and the tabs are English", () => {
    locale.current = "en";
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    renderAt("/dashboard");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Dashboard",
      "Training",
      "Analysis",
      "Race Day",
      "Settings",
    ]);
  });

  it("shows the product name as text and links it to the dashboard", () => {
    renderAt("/training/tasks");
    expect(screen.getByRole("link", { name: "SkatingX" }).getAttribute("href")).toBe("/dashboard");
  });

  it("the selected item is warm-white with navy text and a flame bar, never white on flame", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    renderAt("/race-day/schedule");
    const current = screen.getByRole("link", { name: "比赛日" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.className).toContain("bg-brand-ice");
    expect(current.className).toContain("text-brand-navy");
    expect(current.className).toContain("before:bg-brand-flame");
    expect(current.className).not.toContain("text-white");
    expect(screen.getByRole("link", { name: "总览" }).getAttribute("aria-current")).toBeNull();
  });

  it("an unselected item is light text on the dark bar", () => {
    renderAt("/dashboard");
    const other = screen.getByRole("link", { name: "训练" });
    expect(other.className).toContain("text-brand-ice/80");
    expect(other.className).not.toContain("bg-brand-ice ");
  });

  it("keeps the training tab selected on a sub-page", () => {
    renderAt("/training/shop");
    expect(screen.getByRole("link", { name: "训练" }).getAttribute("aria-current")).toBe("page");
  });

  it("every link and the icons are fit for touch and for screen readers", () => {
    const { container } = renderAt("/dashboard");
    expect(controlsBelowTapTarget(container)).toEqual([]);
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("is only shown from the lg breakpoint, where the bottom bar is hidden", () => {
    const { container } = renderAt("/dashboard");
    expect(container.querySelector("aside")?.className).toMatch(/\bhidden\b.*\blg:flex\b/);
    const bottom = renderAt("/dashboard", <BottomNav />);
    expect(bottom.container.querySelector("nav")?.className).toContain("lg:hidden");
  });
});
