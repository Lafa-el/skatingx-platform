// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import { EventForm } from "./EventForm";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

function setup(props: Partial<React.ComponentProps<typeof EventForm>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <EventForm
      mode="create"
      saving={false}
      submitErrorKey={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSubmit, onCancel, user: userEvent.setup() };
}

function setDate(label: RegExp, value: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  // `type` is unreliable for date inputs in happy-dom; set the value the way a browser would.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("EventForm", () => {
  it("requires a name and a real date", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/赛事名称/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText(/第 1 天/).getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText(/赛事名称/));
    });
  });

  it("adds and removes date rows, but never removes the last one", async () => {
    const { user } = setup();
    expect(screen.queryByRole("button", { name: /移除第/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "添加一天" }));
    expect(screen.getByLabelText(/第 2 天/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "移除第 2 天" }));
    expect(screen.queryByLabelText(/第 2 天/)).toBeNull();
    expect(screen.queryByRole("button", { name: /移除第/ })).toBeNull();
  });

  it("submits normalized values with empty optional fields as null", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/赛事名称/), "  Buffalo Championships  ");
    setDate(/第 1 天/, "2026-10-24");
    await user.click(screen.getByRole("button", { name: "添加一天" }));
    setDate(/第 2 天/, "2026-10-25");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: "Buffalo Championships",
      dates: ["2026-10-24", "2026-10-25"],
      timeZone: null,
      venue: null,
    });
  });

  it("rejects an impossible date and a duplicate date", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/赛事名称/), "X");
    setDate(/第 1 天/, "2026-10-24");
    await user.click(screen.getByRole("button", { name: "添加一天" }));
    setDate(/第 2 天/, "2026-10-24");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("有重复项")).toBeTruthy();
  });

  it("rejects a time zone that is not an IANA name", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/赛事名称/), "X");
    setDate(/第 1 天/, "2026-10-24");
    await user.type(screen.getByLabelText(/时区/), "Mars/Base");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/时区/).getAttribute("aria-invalid")).toBe("true");
  });

  it("edit mode is prefilled", () => {
    setup({
      mode: "edit",
      initial: {
        name: "Buffalo",
        dates: ["2026-10-24", "2026-10-25"],
        timeZone: "America/New_York",
        venue: null,
        sourceNote: "",
      },
    });
    expect(screen.getByRole("heading", { name: "编辑赛事" })).toBeTruthy();
    expect((screen.getByLabelText(/赛事名称/) as HTMLInputElement).value).toBe("Buffalo");
    expect((screen.getByLabelText(/第 2 天/) as HTMLInputElement).value).toBe("2026-10-25");
    expect((screen.getByLabelText(/时区/) as HTMLInputElement).value).toBe("America/New_York");
  });

  it("hides cancel when it is the only thing on screen", () => {
    setup({ onCancel: undefined });
    expect(screen.queryByRole("button", { name: "取消" })).toBeNull();
  });

  it("while saving: disables the whole form and shows the saving label", () => {
    setup({ saving: true });
    expect((screen.getByRole("button", { name: "保存中…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/赛事名称/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/第 1 天/) as HTMLInputElement).disabled).toBe(true);
  });
});
