// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import { RosterForm } from "./RosterForm";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

function setup(props: Partial<React.ComponentProps<typeof RosterForm>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <RosterForm
      mode="create"
      selfAthleteId="lindsay"
      otherSelfExists={false}
      saving={false}
      submitErrorKey={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSubmit, onCancel, user: userEvent.setup() };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/姓名/), "Lindsay");
  await user.type(screen.getByLabelText(/号码/), "134");
  await user.type(screen.getByLabelText(/组别/), "Division 6 Wings");
}

describe("RosterForm", () => {
  it("shows required errors and does not submit an empty form", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("请先修正");
    expect(screen.getAllByText("必填")).toHaveLength(3);
    expect(screen.getByLabelText(/姓名/).getAttribute("aria-invalid")).toBe("true");
  });

  it("moves focus to the first invalid field", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(/姓名/), "Lindsay");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText(/号码/));
    });
  });

  it("links each error to its input through aria-describedby", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "保存" }));
    const input = screen.getByLabelText(/姓名/);
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe("必填");
  });

  it("submits normalized values, not linked to an athlete unless 'mine' is checked", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/姓名/), "  Lindsay  ");
    await user.type(screen.getByLabelText(/号码/), "134");
    await user.type(screen.getByLabelText(/组别/), "Division 6 Wings");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      displayName: "Lindsay",
      bib: "134",
      division: "Division 6 Wings",
      isSelf: false,
      athleteRefId: null,
    });
  });

  it("links the entry to the user's own athlete when 'mine' is checked", async () => {
    const { onSubmit, user } = setup();
    await fillValid(user);
    await user.click(screen.getByLabelText("这是我自己的运动员"));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ isSelf: true, athleteRefId: "lindsay" });
  });

  describe("marking the self row", () => {
    const stored = (over: Partial<NonNullable<React.ComponentProps<typeof RosterForm>["initial"]>> = {}) => ({
      displayName: "Lindsay",
      bib: "134",
      division: "Wings",
      isSelf: true,
      isFollowed: true,
      athleteRefId: "lindsay",
      sourceNote: "",
      ...over,
    });
    const selfBox = () => screen.getByLabelText("这是我自己的运动员") as HTMLInputElement;

    it("another self row exists: marking this one is refused, shows why, and does not submit", async () => {
      const { onSubmit, user } = setup({ otherSelfExists: true });
      await fillValid(user);
      await user.click(selfBox());
      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText("已经有一位本人运动员，先取消原来的再标记")).toBeTruthy();
      expect(selfBox().getAttribute("aria-invalid")).toBe("true");
      await waitFor(() => {
        expect(document.activeElement).toBe(selfBox());
      });
    });

    it("another self row exists: a row that is not marked still saves", async () => {
      const { onSubmit, user } = setup({ otherSelfExists: true });
      await fillValid(user);
      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ isSelf: false, athleteRefId: null });
    });

    it("settings not loaded (no athlete id): marking self is refused and does not submit", async () => {
      const { onSubmit, user } = setup({ selfAthleteId: null });
      await fillValid(user);
      await user.click(selfBox());
      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText("设置还没加载好，稍后再标记本人")).toBeTruthy();
    });

    it("settings not loaded: a row that is not self still saves", async () => {
      const { onSubmit, user } = setup({ selfAthleteId: null });
      await fillValid(user);
      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ isSelf: false, athleteRefId: null });
    });

    it("editing a self row and only renaming keeps the stored link", async () => {
      const { onSubmit, user } = setup({ mode: "edit", initial: stored() });
      const name = screen.getByLabelText(/姓名/);
      await user.clear(name);
      await user.type(name, "Lindsay W");
      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ displayName: "Lindsay W", isSelf: true, athleteRefId: "lindsay" });
    });

    it.each([["someone-else"], [null]])(
      "keeps a stored link of %s instead of re-linking to the active athlete",
      async (athleteRefId) => {
        const { onSubmit, user } = setup({ mode: "edit", initial: stored({ athleteRefId }) });
        await user.type(screen.getByLabelText(/姓名/), "!");
        await user.click(screen.getByRole("button", { name: "保存" }));
        expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ isSelf: true, athleteRefId });
      },
    );

    it.each([
      [{ selfAthleteId: null }, "Settings are still loading. Mark yourself once they are ready."],
      [{ otherSelfExists: true }, "There is already a self row. Unmark it before marking another."],
    ])("the refusal for %o is translated to English", async (props, message) => {
      locale.current = "en";
      try {
        // An existing, valid row that is not self, so only the self gate can refuse it.
        const { onSubmit, user } = setup({
          mode: "edit",
          initial: stored({ isSelf: false, athleteRefId: null }),
          ...props,
        });
        await user.click(screen.getByLabelText("This is my own athlete"));
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByText(message)).toBeTruthy();
      } finally {
        locale.current = "zh";
      }
    });

    // Re-linking a stored null therefore takes two saves: unmark and save, then edit again and mark
    // (the last test of this group).
    it("unmarking and marking again inside one form ends where it started, so the stored null stays", async () => {
      const { onSubmit, user } = setup({ mode: "edit", initial: stored({ athleteRefId: null }) });
      await user.click(selfBox());
      await user.click(selfBox());
      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ isSelf: true, athleteRefId: null });
    });

    it("unmarking a self row clears the link", async () => {
      const { onSubmit, user } = setup({ mode: "edit", initial: stored() });
      await user.click(selfBox());
      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ isSelf: false, athleteRefId: null });
    });

    it("editing a row that is not self and marking it links it to the active athlete", async () => {
      const { onSubmit, user } = setup({ mode: "edit", initial: stored({ isSelf: false, athleteRefId: null }) });
      await user.click(selfBox());
      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ isSelf: true, athleteRefId: "lindsay" });
    });
  });

  it("keeps leading zeros in the bib", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/姓名/), "A");
    await user.type(screen.getByLabelText(/号码/), "007");
    await user.type(screen.getByLabelText(/组别/), "D");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ bib: "007" });
  });

  it("submits with Enter from a field", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/姓名/), "A");
    await user.type(screen.getByLabelText(/号码/), "1");
    await user.type(screen.getByLabelText(/组别/), "D{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("while saving: disables fields and buttons, shows the saving label, ignores submit", async () => {
    const { onSubmit } = setup({
      saving: true,
      initial: {
        displayName: "A",
        bib: "1",
        division: "D",
        isSelf: false,
        isFollowed: true,
        athleteRefId: null,
        sourceNote: "",
      },
    });
    const button = screen.getByRole("button", { name: "保存中…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/姓名/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(true);
    const form = screen.getByRole("form");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the save error and keeps what the user typed", async () => {
    const { user } = setup({ submitErrorKey: "raceDay.error.saveNetwork" });
    expect(screen.getByRole("alert").textContent).toContain("请检查网络");
    await user.type(screen.getByLabelText(/姓名/), "Kept");
    expect((screen.getByLabelText(/姓名/) as HTMLInputElement).value).toBe("Kept");
  });

  it("edit mode is prefilled and titled as editing", () => {
    setup({
      mode: "edit",
      initial: {
        displayName: "Lindsay",
        bib: "134",
        division: "Wings",
        isSelf: true,
        isFollowed: false,
        athleteRefId: "lindsay",
        sourceNote: "entry list",
      },
    });
    expect(screen.getByRole("heading", { name: "编辑运动员" })).toBeTruthy();
    expect((screen.getByLabelText(/姓名/) as HTMLInputElement).value).toBe("Lindsay");
    expect((screen.getByLabelText("这是我自己的运动员") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/来源说明/) as HTMLInputElement).value).toBe("entry list");
  });

  it("cancel calls onCancel without submitting", async () => {
    const { onSubmit, onCancel, user } = setup();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is translated to English", async () => {
    locale.current = "en";
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getAllByText("Required")).toHaveLength(3);
    locale.current = "zh";
  });
});
