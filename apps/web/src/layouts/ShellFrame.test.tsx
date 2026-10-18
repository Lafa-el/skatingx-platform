// @vitest-environment happy-dom
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { AppShell } from "./AppShell";
import { ICE_PAGES, isIcePage } from "./icePages";
import { ShellFrame } from "./ShellFrame";

// The bars have their own tests; here only how the frame places them and which page colour it uses.
vi.mock("@/components/Header", () => ({ Header: () => <header>header</header> }));
vi.mock("@/components/SideNav", () => ({ SideNav: () => <aside>side</aside> }));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => <nav>bottom</nav> }));

const frame = (container: HTMLElement) => container.firstElementChild as HTMLElement;

const inFrame = (path: string, ui: React.ReactElement = <ShellFrame>x</ShellFrame>) =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("ShellFrame", () => {
  it("places the side bar, header, tabs, content and bottom bar, and clears the fixed side bar", () => {
    const { container } = inFrame(
      "/settings",
      <ShellFrame subNav={<nav>tabs</nav>}>
        <p>content</p>
      </ShellFrame>,
    );
    const order = Array.from(frame(container).children).map((el) => el.textContent);
    expect(order).toEqual(["side", "header", "tabs", "content", "bottom"]);
    expect(frame(container).className).toContain("lg:pl-64");
    expect(screen.getByRole("main").className).toContain("lg:pb-6");
  });

  it("the main area keeps room for the phone's bottom bar", () => {
    inFrame("/settings");
    expect(screen.getByRole("main").className).toContain("pb-[calc(var(--sx-nav-height)+1.5rem)]");
  });

  it("paints the warm white only on pages in ICE_PAGES", () => {
    const ice = inFrame("/dashboard");
    expect(frame(ice.container).className).toContain("bg-brand-ice");
    ice.unmount();
    const legacy = inFrame("/race-day");
    expect(frame(legacy.container).className).not.toContain("bg-brand-ice");
  });
});

describe("ICE_PAGES", () => {
  it("matches a page and the pages below it, and nothing that only shares a prefix", () => {
    expect(ICE_PAGES).toContain("/settings");
    expect(isIcePage("/settings")).toBe(true);
    expect(isIcePage("/settings/anything")).toBe(true);
    expect(isIcePage("/settingsx")).toBe(false);
    expect(isIcePage("/analysis")).toBe(true);
    expect(isIcePage("/analysis/pacing")).toBe(true);
    expect(isIcePage("/analysisx")).toBe(false);
    expect(isIcePage("/race-day")).toBe(false);
    expect(isIcePage("/ai-coach")).toBe(false);
    expect(isIcePage("/training/shop")).toBe(true);
  });
});

describe("AppShell page colour", () => {
  const at = (path: string) =>
    inFrame(
      path,
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/settings" element={<p>settings</p>} />
          <Route path="/athlete" element={<p>athlete</p>} />
        </Route>
      </Routes>,
    );

  it("Settings is warm white; a page not yet restyled is not", () => {
    const settings = at("/settings");
    expect(frame(settings.container).className).toContain("bg-brand-ice");
    settings.unmount();
    const athlete = at("/athlete");
    expect(frame(athlete.container).className).not.toContain("bg-brand-ice");
  });
});
