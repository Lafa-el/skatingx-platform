// @vitest-environment happy-dom
import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { render } from "@/test/dom";

import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("shows the photo when a URL is ready", () => {
    const view = render(<Avatar letter="L" photoUrl="https://example.test/avatar.png" />);
    const img = view.container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.test/avatar.png");
  });

  it("shows the letter when there is no URL", () => {
    const view = render(<Avatar letter="L" />);
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.textContent).toContain("L");
  });

  it("falls back to the letter when the image fails", () => {
    const view = render(<Avatar letter="L" photoUrl="https://example.test/missing.png" />);
    const img = view.container.querySelector("img");
    expect(img).toBeTruthy();
    fireEvent.error(img as Element);
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.textContent).toContain("L");
  });
});
