// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/dom";

import { CheckboxField, DANGER_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, SelectField, TextField } from "./fields";

/**
 * Phone-use guards. Layout cannot be measured in happy-dom, so these pin the classes that were
 * checked in a real browser at 320 and 375 px (S5b): a 44 px touch target, and fields that can
 * shrink instead of pushing the page sideways.
 */
describe("touch targets", () => {
  it.each([
    ["primary", PRIMARY_BUTTON],
    ["secondary", SECONDARY_BUTTON],
    ["danger", DANGER_BUTTON],
  ])("the %s button style is at least 44px tall and centers its label", (_name, style) => {
    expect(style).toContain("min-h-11");
    expect(style).toContain("inline-flex");
    expect(style).toContain("items-center");
  });

  it("text inputs and selects are at least 44px tall", () => {
    render(
      <>
        <TextField label="Name" value="" onChange={() => undefined} />
        <SelectField label="Day" value="" options={[{ value: "", label: "x" }]} onChange={() => undefined} />
      </>,
    );
    expect(screen.getByLabelText("Name").className).toContain("min-h-11");
    expect(screen.getByLabelText("Day").className).toContain("min-h-11");
  });

  it("a checkbox row is a 44px target and its long label can wrap", () => {
    render(<CheckboxField label="A very long athlete name" checked={false} onChange={() => undefined} />);
    const label = screen.getByText("A very long athlete name");
    expect(label.className).toContain("break-words");
    expect(label.className).toContain("min-w-0");
    expect(label.parentElement?.className).toContain("min-h-11");
  });
});
