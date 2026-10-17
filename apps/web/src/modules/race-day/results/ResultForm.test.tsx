// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";

import { EMPTY_RESULT_FORM, type ResultFormValues } from "../lib/results";
import { ResultForm } from "./ResultForm";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

function setup(
  over: Partial<{
    updatesExisting: boolean;
    initial: ResultFormValues;
    focusOnMount: boolean;
    saving: boolean;
    submitErrorKey: "raceDay.error.saveNetwork" | null;
  }> = {},
) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <ResultForm
      updatesExisting={false}
      initial={EMPTY_RESULT_FORM}
      focusOnMount={false}
      saving={false}
      submitErrorKey={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onSubmit, onCancel, user: userEvent.setup() };
}

const timeBox = () => screen.getByLabelText(/^成绩/);

describe("ResultForm", () => {
  it("has labelled fields for a finished result, with the time required and a format hint", () => {
    setup();
    expect(screen.getByRole("form", { name: "录入成绩" })).toBeTruthy();
    expect((screen.getByLabelText("状态") as HTMLSelectElement).value).toBe("finished");
    expect(timeBox().getAttribute("aria-required")).toBe("true");
    expect(screen.getByText(/最多三位小数/)).toBeTruthy();
    expect(timeBox().getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByLabelText("名次（可选）")).toBeTruthy();
    expect(screen.getByLabelText("晋级（可选）")).toBeTruthy();
  });

  it("submits a valid finished result exactly as typed, including a third decimal", async () => {
    const { onSubmit, user } = setup();
    await user.type(timeBox(), "0:49.123");
    await user.type(screen.getByLabelText("名次（可选）"), "2");
    await user.selectOptions(screen.getByLabelText("晋级（可选）"), "yes");
    await user.type(screen.getByLabelText("来源说明（可选）"), "board");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    expect(onSubmit).toHaveBeenCalledWith({
      status: "finished",
      time: "0:49.123",
      place: "2",
      advanced: true,
      sourceNote: "board",
    });
  });

  it("keeps place and advancement unknown when left alone", async () => {
    const { onSubmit, user } = setup();
    await user.type(timeBox(), "49.8");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ place: "", advanced: null }));
  });

  it("does not submit a finished race without a time, and puts focus on the problem", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("已完赛需要填写成绩")).toBeTruthy();
    expect(screen.getByText("请先修正标出的问题。")).toBeTruthy();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(timeBox());
    });
    expect(timeBox().getAttribute("aria-invalid")).toBe("true");
  });

  it.each([
    ["1:75.00", /成绩格式不对/],
    ["49.1234", /最多保留三位小数/],
    ["30:00.001", /成绩格式不对/],
  ])("explains the time %s", async (text, message) => {
    const { onSubmit, user } = setup();
    await user.type(timeBox(), text);
    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeTruthy();
  });

  it("rejects a bad place", async () => {
    const { onSubmit, user } = setup();
    await user.type(timeBox(), "49.8");
    await user.type(screen.getByLabelText("名次（可选）"), "0");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/名次需要是 1 到 999/)).toBeTruthy();
  });

  it("hides time, place and advancement for DNS/DNF/DQ and never sends what was typed before", async () => {
    const { onSubmit, user } = setup();
    await user.type(timeBox(), "49.8");
    await user.type(screen.getByLabelText("名次（可选）"), "3");
    await user.selectOptions(screen.getByLabelText("晋级（可选）"), "yes");

    await user.selectOptions(screen.getByLabelText("状态"), "DNF");
    expect(screen.queryByLabelText(/^成绩/)).toBeNull();
    expect(screen.queryByLabelText("名次（可选）")).toBeNull();
    expect(screen.queryByLabelText("晋级（可选）")).toBeNull();

    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    expect(onSubmit).toHaveBeenCalledWith({
      status: "DNF",
      time: "",
      place: "",
      advanced: null,
      sourceNote: "",
    });
  });

  it("offers all four statuses with their DNS/DNF/DQ names", () => {
    setup();
    const options = Array.from((screen.getByLabelText("状态") as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual(["已完赛", "未出发（DNS）", "未完赛（DNF）", "取消资格（DQ）"]);
  });

  it("shows stored values when editing, and says that saving returns the result to pending", () => {
    setup({
      updatesExisting: true,
      initial: { status: "finished", time: "1:44.231", place: "2", advanced: "no", sourceNote: "n" },
    });
    expect(screen.getByRole("form", { name: "编辑成绩" })).toBeTruthy();
    expect((timeBox() as HTMLInputElement).value).toBe("1:44.231");
    expect((screen.getByLabelText("晋级（可选）") as HTMLSelectElement).value).toBe("no");
    expect(screen.getByText(/已有成绩.*待确认/)).toBeTruthy();
  });

  it("does not show the update note for a new result", () => {
    setup();
    expect(screen.queryByText(/已有成绩/)).toBeNull();
  });

  it("disables every control and shows the saving label while saving, and ignores a second submit", async () => {
    const { onSubmit } = setup({ saving: true, initial: { ...EMPTY_RESULT_FORM, time: "49.8" } });
    expect((screen.getByLabelText("状态") as HTMLSelectElement).disabled).toBe(true);
    expect((timeBox() as HTMLInputElement).disabled).toBe(true);
    const save = screen.getByRole("button", { name: "保存中…" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    save.form?.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a save error and keeps what was typed", () => {
    setup({ submitErrorKey: "raceDay.error.saveNetwork", initial: { ...EMPTY_RESULT_FORM, time: "49.8" } });
    expect(screen.getByRole("alert").textContent).toContain("未能保存");
    expect((timeBox() as HTMLInputElement).value).toBe("49.8");
  });

  it("cancels", async () => {
    const { onCancel, user } = setup();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("moves focus into the form only when asked to", async () => {
    setup({ focusOnMount: true });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("状态"));
    });
  });

  it("does not take focus on its own", () => {
    setup();
    expect(document.activeElement).toBe(document.body);
  });

  it("renders in English", () => {
    locale.current = "en";
    try {
      setup();
      expect(screen.getByRole("form", { name: "Enter a result" })).toBeTruthy();
      expect(screen.getByLabelText("Status")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Save result" })).toBeTruthy();
      const options = Array.from((screen.getByLabelText("Status") as HTMLSelectElement).options).map((o) => o.text);
      expect(options).toEqual(["Finished", "Did not start (DNS)", "Did not finish (DNF)", "Disqualified (DQ)"]);
    } finally {
      locale.current = "zh";
    }
  });
});
