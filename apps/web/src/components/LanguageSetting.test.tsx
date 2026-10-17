// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";

import { LanguageSetting } from "./LanguageSetting";

function setup(over: Partial<React.ComponentProps<typeof LanguageSetting>> = {}) {
  const onChange = vi.fn();
  render(<LanguageSetting language="zh" disabled={false} failed={false} onChange={onChange} {...over} />);
  return { onChange, user: userEvent.setup() };
}

describe("LanguageSetting", () => {
  it("offers 中文 and English as one radio group with the current language selected", () => {
    setup({ language: "en" });
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(["zh", "en"]);
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(radios.find((r) => r.value === "en")?.checked).toBe(true);
    expect(radios.find((r) => r.value === "zh")?.checked).toBe(false);
    expect(screen.getByLabelText("中文")).toBeTruthy();
    expect(screen.getByLabelText("English")).toBeTruthy();
  });

  // Layout is not computed in happy-dom, so the 44px touch target (min-h-11) is pinned through its
  // class, and the label wraps the radio so the whole row is the target, not only the 20px circle.
  it("makes the whole option row a tap target of at least 44px", () => {
    setup({ language: "zh" });
    for (const radio of screen.getAllByRole("radio")) {
      const label = radio.closest("label");
      expect(label, radio.getAttribute("value") ?? "").toBeTruthy();
      expect(label?.className).toContain("min-h-11");
    }
  });

  it("selects an option when its text is tapped", async () => {
    const { onChange, user } = setup({ language: "zh" });
    await user.click(screen.getByText("English"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("en");
  });

  it("reports the language the user picks", async () => {
    const { onChange, user } = setup({ language: "zh" });
    await user.click(screen.getByLabelText("English"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("en");
  });

  it("can be changed with the keyboard", async () => {
    const { onChange, user } = setup({ language: "zh" });
    screen.getByLabelText("中文").focus();
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenCalledWith("en");
  });

  it("describes the group, in the active language", () => {
    setup({ language: "zh" });
    expect(screen.getByRole("group").getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/选择界面语言/)).toBeTruthy();
  });

  it("is translated when English is active", () => {
    setup({ language: "en" });
    expect(screen.getByText(/Choose the interface language/)).toBeTruthy();
  });

  it("disables both options while the settings are not ready", () => {
    setup({ disabled: true });
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.closest("fieldset")?.disabled).toBe(true);
    }
  });

  it("shows no error normally and an alert, in the active language, after a failed save", () => {
    const { unmount } = render(
      <LanguageSetting language="zh" disabled={false} failed={false} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    unmount();

    render(<LanguageSetting language="en" disabled={false} failed onChange={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("was not saved");
  });
});
