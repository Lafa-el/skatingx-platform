// @vitest-environment happy-dom
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

import { ScrollRow } from "./ScrollRow";
import { SubNav } from "./SubNav";

// happy-dom does no layout, so the sizes a browser would measure are set by hand.
const size = (el: HTMLElement, sizes: Record<string, number>) => {
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(el, name, { configurable: true, writable: true, value });
  }
};

const fadeNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-fade]")).map((el) => el.getAttribute("data-fade"));

describe("ScrollRow", () => {
  const tabs = (
    <>
      <button type="button">One</button>
      <button type="button" aria-pressed="true">Two</button>
    </>
  );

  it("shows no fade when everything fits", () => {
    const { container } = render(<ScrollRow fadeFrom="white">{tabs}</ScrollRow>);
    // happy-dom reports zero sizes, which is "fits".
    expect(fadeNames(container)).toEqual([]);
  });

  it("fades the far edge when there is more to the right, both edges in the middle, only the near one at the end", () => {
    const { container } = render(<ScrollRow fadeFrom="white">{tabs}</ScrollRow>);
    const row = container.querySelector(".overflow-x-auto") as HTMLElement;
    size(row, { clientWidth: 100, scrollWidth: 300, scrollLeft: 0 });
    act(() => {
      row.dispatchEvent(new Event("scroll"));
    });
    expect(fadeNames(container)).toEqual(["after"]);

    size(row, { scrollLeft: 80 });
    act(() => {
      row.dispatchEvent(new Event("scroll"));
    });
    expect(fadeNames(container)).toEqual(["before", "after"]);

    size(row, { scrollLeft: 200 });
    act(() => {
      row.dispatchEvent(new Event("scroll"));
    });
    expect(fadeNames(container)).toEqual(["before"]);
  });

  it("the fades are decoration: hidden from assistive technology and not clickable, in the colour behind the row", () => {
    const { container } = render(<ScrollRow fadeFrom="ice">{tabs}</ScrollRow>);
    const row = container.querySelector(".overflow-x-auto") as HTMLElement;
    size(row, { clientWidth: 100, scrollWidth: 300, scrollLeft: 0 });
    act(() => {
      row.dispatchEvent(new Event("scroll"));
    });
    const fade = container.querySelector("[data-fade]")!;
    expect(fade.getAttribute("aria-hidden")).toBe("true");
    expect(fade.className).toContain("pointer-events-none");
    expect((fade as HTMLElement).style.backgroundImage).toContain("--color-brand-ice");
  });

  it("hides the scroll bar on a phone only (a desktop mouse still needs it), and keeps the row's own classes", () => {
    const { container } = render(
      <ScrollRow fadeFrom="white" rowClassName="flex gap-2">{tabs}</ScrollRow>,
    );
    const row = container.querySelector(".overflow-x-auto") as HTMLElement;
    expect(row.className).toContain("max-lg:sx-no-scrollbar");
    expect(row.className.split(/\s+/)).not.toContain("sx-no-scrollbar");
    expect(row.className).toContain("flex gap-2");
  });

  it("brings the current item into view when it is drawn, and again when the selection moves", () => {
    const Row = ({ current }: { current: "a" | "b" }) => (
      <ScrollRow fadeFrom="white">
        <button type="button" aria-pressed={current === "a"} data-id="a">A</button>
        <button type="button" aria-pressed={current === "b"} data-id="b">B</button>
      </ScrollRow>
    );
    const { container, rerender } = render(<Row current="a" />);
    const row = container.querySelector(".overflow-x-auto") as HTMLElement;
    const button = (id: string) => container.querySelector(`[data-id="${id}"]`) as HTMLElement;
    size(row, { clientWidth: 100, scrollLeft: 0 });
    size(button("a"), { offsetLeft: 0, offsetWidth: 60 });
    size(button("b"), { offsetLeft: 240, offsetWidth: 60 });

    rerender(<Row current="b" />);
    // Centred: 240 - (100 - 60) / 2.
    expect(row.scrollLeft).toBe(220);
  });

  it("does not move the row again on a render that changes nothing about the selection", () => {
    const Row = () => (
      <ScrollRow fadeFrom="white">
        <button type="button" aria-pressed="true" data-id="a">A</button>
      </ScrollRow>
    );
    const { container, rerender } = render(<Row />);
    const row = container.querySelector(".overflow-x-auto") as HTMLElement;
    size(row, { clientWidth: 100, scrollLeft: 0 });
    size(container.querySelector('[data-id="a"]') as HTMLElement, { offsetLeft: 240, offsetWidth: 60 });
    row.scrollLeft = 17; // the user scrolled
    rerender(<Row />);
    expect(row.scrollLeft).toBe(17);
  });

  it("a nav keeps its landmark name", () => {
    render(
      <ScrollRow as="nav" aria-label="Sections" fadeFrom="white">
        {tabs}
      </ScrollRow>,
    );
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
  });
});

describe("SubNav in a ScrollRow", () => {
  it("keeps its name, its links and the current tab, with no old colour classes", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/training/tasks"]}>
        <SubNav
          label="Sections"
          items={[
            { to: "/training", label: "Home" },
            { to: "/training/tasks", label: "Tasks" },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tasks" }).getAttribute("aria-current")).toBe("page");
    expect(legacyColourClasses(container)).toEqual([]);
  });
});
