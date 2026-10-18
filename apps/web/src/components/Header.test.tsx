// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { Header } from "./Header";

vi.mock("@/components/AthleteSelector", () => ({ AthleteSelector: () => null }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

describe("Header", () => {
  it("links the product name to the dashboard", () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "SkatingX" }).getAttribute("href")).toBe("/dashboard");
  });

  // Layout is not computed in happy-dom, so the 44px touch target (min-h-11, the project's size,
  // see race-day fields) is pinned through its class; the rendered height was measured in a browser.
  it("keeps the link at least 44px tall so it is easy to tap on a phone", () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "SkatingX" });
    expect(link.className).toContain("min-h-11");
    expect(link.className).toContain("inline-flex");
  });

  it("from the lg breakpoint shows a trail to the current section; on a page outside the main tabs, only the name", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/training/tasks"]}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByText("训练")).toBeTruthy();
    unmount();
    render(
      <MemoryRouter initialEntries={["/athlete"]}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.queryByText("训练")).toBeNull();
    expect(screen.queryByText("总览")).toBeNull();
  });
});
