// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { legacyColourClasses } from "@/test/legacyLook";
import { render, screen } from "@/test/dom";

import {
  CheckboxField,
  DANGER_BUTTON,
  FormMessage,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SelectField,
  TextAreaField,
  TextField,
} from "./fields";

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

describe("UI v1 look", () => {
  it("fields, errors, hints and the checkbox carry no old colour classes", () => {
    const view = render(
      <>
        <TextField label="Name" value="" onChange={() => undefined} error="Required" hint="A hint" />
        <TextAreaField label="Note" value="" onChange={() => undefined} error="Too long" hint="Another hint" />
        <SelectField label="Day" value="" options={[{ value: "", label: "x" }]} onChange={() => undefined} error="Pick one" />
        <CheckboxField label="Mine" checked={false} onChange={() => undefined} />
      </>,
    );
    expect(legacyColourClasses(view.container)).toEqual([]);
  });

  it("a field error is an icon plus words, in the error red", () => {
    render(<TextField label="Name" value="" onChange={() => undefined} error="Required" />);
    const message = screen.getByText("Required").parentElement as HTMLElement;
    expect(message.querySelector("svg")).not.toBeNull();
    expect(message.className).toContain("text-status-danger");
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Name").className).toContain("aria-[invalid=true]:border-status-danger");
  });

  it("an error message is an alert with an icon; an info message is a status with an icon", () => {
    const view = render(
      <>
        <FormMessage tone="error">Broke</FormMessage>
        <FormMessage tone="info">FYI</FormMessage>
      </>,
    );
    expect(screen.getByRole("alert").querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("status").querySelector("svg")).not.toBeNull();
    expect(legacyColourClasses(view.container)).toEqual([]);
  });

  it("buttons put navy text on flame, never white, and the danger button uses the error red", () => {
    expect(PRIMARY_BUTTON).toContain("bg-brand-flame");
    expect(PRIMARY_BUTTON).toContain("text-brand-navy");
    for (const style of [PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_BUTTON]) {
      expect(style).not.toContain("text-white");
      expect(style).not.toMatch(/-(sky|slate|red|amber|emerald)-\d/);
    }
    expect(DANGER_BUTTON).toContain("text-status-danger");
    expect(DANGER_BUTTON).not.toContain("bg-brand-flame");
  });
});
