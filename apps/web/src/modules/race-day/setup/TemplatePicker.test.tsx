// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { BUFFALO_2026_TEMPLATE } from "@skatingx/skating-domain";

import { render, screen, userEvent } from "@/test/dom";

import { TemplatePicker } from "./TemplatePicker";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

function setup(over: Partial<React.ComponentProps<typeof TemplatePicker>> = {}) {
  const onApply = vi.fn();
  render(
    <TemplatePicker
      existingEventIds={new Set()}
      saving={false}
      submitErrorKey={null}
      onApply={onApply}
      {...over}
    />,
  );
  return { onApply, user: userEvent.setup() };
}

describe("TemplatePicker", () => {
  it("describes exactly what the template contains and what the user must enter", () => {
    setup();
    expect(screen.getByText("Buffalo Championships 模板", { selector: "p" })).toBeTruthy();
    const description = screen.getByText(/只包含赛事名/);
    expect(description.textContent).toContain("500m、500m、1000m、Super 1500m");
    expect(description.textContent).toContain("全部标为待确认");
    expect(description.textContent).toContain("需要你自己录入");
  });

  it("applies the Buffalo template when asked", async () => {
    const { onApply, user } = setup();
    await user.click(screen.getByRole("button", { name: /用模板创建赛事/ }));
    expect(onApply).toHaveBeenCalledExactlyOnceWith(BUFFALO_2026_TEMPLATE);
  });

  it("does not offer a template that was already used", () => {
    setup({ existingEventIds: new Set([BUFFALO_2026_TEMPLATE.eventId]) });
    expect(screen.queryByRole("button", { name: /用模板创建赛事/ })).toBeNull();
    expect(screen.getByText("已经使用过这个模板。")).toBeTruthy();
  });

  it("while saving the button is disabled and says so", () => {
    setup({ saving: true });
    expect((screen.getByRole("button", { name: /保存中/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a save error", () => {
    setup({ submitErrorKey: "raceDay.error.saveNetwork" });
    expect(screen.getByRole("alert").textContent).toContain("请检查网络");
  });
});
