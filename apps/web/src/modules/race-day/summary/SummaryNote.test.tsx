// @vitest-environment happy-dom
import type { RaceSummaryDoc } from "@skatingx/schema";
import { describe, expect, it, vi } from "vitest";

import { fireEvent } from "@testing-library/react";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import { SummaryNote } from "./SummaryNote";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const doc = (coachNote: string | null): RaceSummaryDoc => ({
  summaryVersion: "race-summary/1",
  generatedAt: "2026-10-24T16:30:00.000Z",
  coachNote,
  schemaVersion: 1,
  createdAt: "2026-10-24T16:00:00.000Z",
  updatedAt: "2026-10-24T16:30:00.000Z",
});

function setup(props: Partial<Parameters<typeof SummaryNote>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  const onDelete = vi.fn().mockResolvedValue(true);
  const base = {
    saved: null,
    unreadable: false,
    timeZone: "America/New_York",
    saving: false,
    deleting: false,
    submitErrorKey: null,
    onSave,
    onDelete,
    ...props,
  } satisfies Parameters<typeof SummaryNote>[0];
  const view = render(<SummaryNote {...base} />);
  return { user: userEvent.setup(), onSave, onDelete, rerender: (next: Partial<typeof base>) => view.rerender(<SummaryNote {...base} {...next} />) };
}

const box = () => screen.getByLabelText("备注") as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: "保存备注" }) as HTMLButtonElement;

describe("SummaryNote", () => {
  it("empty state: says there is no note, save is disabled and there is nothing to delete", () => {
    setup();
    expect(screen.getByText("还没有保存的备注。")).toBeTruthy();
    expect(box().value).toBe("");
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "删除总结备注" })).toBeNull();
  });

  it("a plain textarea with a label and a hint, and no link to anything", () => {
    setup();
    expect(box().tagName).toBe("TEXTAREA");
    expect(screen.getByText(/不会生成任何建议/)).toBeTruthy();
  });

  it("typing enables save, which sends the text and then drops the draft", async () => {
    const { user, onSave, rerender } = setup();
    await user.type(box(), "Tired in the last lap");
    expect(saveButton().disabled).toBe(false);
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith("Tired in the last lap");
    rerender({ saved: doc("Tired in the last lap") });
    await waitFor(() => {
      expect(box().value).toBe("Tired in the last lap");
    });
    expect(saveButton().disabled).toBe(true);
  });

  it("after a successful save the field follows the saved note again, including a later change from another device", async () => {
    const { user, rerender } = setup();
    await user.type(box(), "mine");
    await user.click(saveButton());
    rerender({ saved: doc("mine") });
    rerender({ saved: doc("edited elsewhere") });
    await waitFor(() => {
      expect(box().value).toBe("edited elsewhere");
    });
  });

  it("a submit that arrives while nothing changed does not write", () => {
    const { onSave } = setup({ saved: doc("Hello") });
    fireEvent.submit(box().closest("form") as HTMLFormElement);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the saved note and when it was saved, in the event's time zone", () => {
    setup({ saved: doc("Hello") });
    expect(box().value).toBe("Hello");
    expect(screen.getByText(/上次保存:.*GMT-4.*12:30/)).toBeTruthy();
  });

  it("save stays disabled while the text equals what is saved, even with surrounding spaces", async () => {
    const { user } = setup({ saved: doc("Hello") });
    await user.type(box(), "   ");
    expect(saveButton().disabled).toBe(true);
    await user.type(box(), "!");
    expect(saveButton().disabled).toBe(false);
  });

  it("clearing a saved note can be saved: it sends an empty note", async () => {
    const { user, onSave } = setup({ saved: doc("Hello") });
    await user.clear(box());
    expect(saveButton().disabled).toBe(false);
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith("");
  });

  it("a note of only invisible characters counts as empty: nothing to save when there is no note", async () => {
    const { user } = setup();
    await user.type(box(), "\u200b");
    expect(saveButton().disabled).toBe(true);
  });

  it("an over-long note shows the error under the field and is not sent", async () => {
    const { user, onSave } = setup();
    await user.click(box());
    await user.paste("n".repeat(2001));
    await user.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("内容太长,请缩短")).toBeTruthy();
    expect(box().getAttribute("aria-invalid")).toBe("true");
  });

  it("typing again clears the error, and the text is never cut off silently", async () => {
    const { user } = setup();
    await user.click(box());
    await user.paste("n".repeat(2001));
    await user.click(saveButton());
    await user.type(box(), "x");
    expect(screen.queryByText("内容太长,请缩短")).toBeNull();
    expect(box().value).toHaveLength(2002);
  });

  it("keeps the draft when the save fails, and shows the message from the page", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const { user } = setup({ onSave, submitErrorKey: "raceDay.error.saveNetwork" });
    await user.type(box(), "keep me");
    await user.click(saveButton());
    expect(box().value).toBe("keep me");
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("while saving, the field and button are disabled and it does not save twice", async () => {
    const { user, onSave } = setup({ saving: true, saved: doc("a") });
    expect(box().disabled).toBe(true);
    const button = screen.getByRole("button", { name: "保存中…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("follows a change from another device while the user has not typed", () => {
    const { rerender } = setup({ saved: doc("first") });
    expect(box().value).toBe("first");
    rerender({ saved: doc("second") });
    expect(box().value).toBe("second");
  });

  it("does not overwrite what the user is typing when the saved note changes elsewhere", async () => {
    const { user, rerender } = setup({ saved: doc("first") });
    await user.type(box(), " more");
    rerender({ saved: doc("second") });
    expect(box().value).toBe("first more");
  });

  it("delete is two steps; the warning says the numbers on the card are not affected", async () => {
    const { user, onDelete } = setup({ saved: doc("Hello") });
    await user.click(screen.getByRole("button", { name: "删除总结备注" }));
    expect(onDelete).not.toHaveBeenCalled();
    const warning = screen.getByRole("alert");
    expect(warning.textContent).toContain("无法恢复");
    expect(warning.textContent).toContain("不受影响");
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("cancelling the delete deletes nothing", async () => {
    const { user, onDelete } = setup({ saved: doc("Hello") });
    await user.click(screen.getByRole("button", { name: "删除总结备注" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "删除总结备注" })).toBeTruthy();
  });

  it("after a delete the unsaved draft is dropped too", async () => {
    const { user, rerender } = setup({ saved: doc("Hello") });
    await user.type(box(), " extra");
    await user.click(screen.getByRole("button", { name: "删除总结备注" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    rerender({ saved: null });
    await waitFor(() => {
      expect(box().value).toBe("");
    });
  });

  it("a failed delete keeps the draft", async () => {
    const onDelete = vi.fn().mockResolvedValue(false);
    const { user } = setup({ saved: doc("Hello"), onDelete });
    await user.type(box(), " extra");
    await user.click(screen.getByRole("button", { name: "删除总结备注" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(box().value).toBe("Hello extra");
  });

  it("an unreadable saved note is hidden: no editor, only delete", () => {
    setup({ unreadable: true });
    expect(screen.getByRole("alert").textContent).toContain("无法读取");
    expect(screen.queryByLabelText("备注")).toBeNull();
    expect(screen.getByRole("button", { name: "删除总结备注" })).toBeTruthy();
  });

  it("English locale", () => {
    locale.current = "en";
    setup({ saved: doc("Hi") });
    expect(screen.getByLabelText("Note")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete summary note" })).toBeTruthy();
    expect(screen.getByText(/Last saved:/)).toBeTruthy();
    locale.current = "zh";
  });
});
