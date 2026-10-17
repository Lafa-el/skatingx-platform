// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { render } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";

import { SubNav } from "./SubNav";

describe("SubNav: tap targets (44px)", () => {
  it("every link asks for 44px", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/training"]}>
        <SubNav
          label="Sections"
          items={[
            { to: "/training", label: "Home" },
            { to: "/training/tasks", label: "Tasks" },
          ]}
        />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll("a").length).toBe(2);
    expect(controlsBelowTapTarget(container)).toEqual([]);
  });
});
