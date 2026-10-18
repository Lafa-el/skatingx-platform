// @vitest-environment happy-dom
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { AppShell } from "./AppShell";
import { ShellFrame } from "./ShellFrame";

// The bars have their own tests; here only how the frame places them and which page colour it uses.
vi.mock("@/components/Header", () => ({ Header: () => <header>header</header> }));
vi.mock("@/components/SideNav", () => ({ SideNav: () => <aside>side</aside> }));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => <nav>bottom</nav> }));

const frame = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe("ShellFrame", () => {
  it("places the side bar, header, tabs, content and bottom bar, and clears the fixed side bar", () => {
    const { container } = render(
      <ShellFrame subNav={<nav>tabs</nav>}>
        <p>content</p>
      </ShellFrame>,
    );
    const order = Array.from(frame(container).children).map((el) => el.textContent);
    expect(order).toEqual(["side", "header", "tabs", "content", "bottom"]);
    expect(frame(container).className).toContain("lg:pl-64");
    expect(screen.getByRole("main").className).toContain("lg:pb-6");
  });

  it("legacy page tone has no page colour of its own; ice paints the UI v1 warm white", () => {
    const legacy = render(<ShellFrame>x</ShellFrame>);
    expect(frame(legacy.container).className).not.toContain("bg-brand-ice");
    legacy.unmount();
    const ice = render(<ShellFrame pageTone="ice">x</ShellFrame>);
    expect(frame(ice.container).className).toContain("bg-brand-ice");
  });

  it("the main area keeps room for the phone's bottom bar", () => {
    render(<ShellFrame>x</ShellFrame>);
    expect(screen.getByRole("main").className).toContain("pb-[calc(var(--sx-nav-height)+1.5rem)]");
  });
});

describe("AppShell page colour", () => {
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/settings" element={<p>settings</p>} />
            <Route path="/dashboard" element={<p>dashboard</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

  it("only the restyled pages (Settings, for now) get the warm-white colour", () => {
    const settings = at("/settings");
    expect(frame(settings.container).className).toContain("bg-brand-ice");
    settings.unmount();
    const dashboard = at("/dashboard");
    expect(frame(dashboard.container).className).not.toContain("bg-brand-ice");
  });
});
