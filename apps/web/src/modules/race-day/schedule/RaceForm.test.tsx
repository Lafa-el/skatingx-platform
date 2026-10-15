// @vitest-environment happy-dom
import type { RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import { RaceForm } from "./RaceForm";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const NY = "America/New_York";
const EVENT = { dates: ["2026-10-24", "2026-10-25"], timeZone: NY as string | null };

function rosterEntry(over: Partial<RaceRosterEntry>): RaceRosterEntry {
  return {
    rosterId: "r1",
    displayName: "Test Skater",
    bib: "000",
    division: "D",
    isSelf: false,
    isFollowed: true,
    athleteRefId: null,
    verification: "pending",
    source: "manual",
    sourceNote: "",
    verifiedAt: null,
    schemaVersion: 1,
    ...over,
  };
}

function setup(props: Partial<React.ComponentProps<typeof RaceForm>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <RaceForm
      mode="create"
      event={EVENT}
      roster={[]}
      defaultSortOrder={4}
      saving={false}
      submitErrorKey={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSubmit, onCancel, user: userEvent.setup() };
}

function setValue(input: HTMLElement, value: string) {
  // `type` is unreliable for time inputs in happy-dom; set the value the way a browser would.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("RaceForm", () => {
  it("requires the race label and focuses it", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/项目/).getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText(/项目/));
    });
  });

  it("submits a race with an unknown day and time as nulls, using the default order", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/项目/), "500m");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      distanceId: "500m",
      label: "500m",
      sortOrder: 4,
      day: null,
      round: null,
      heat: null,
      scheduledAt: null,
      rosterIds: [],
      sourceNote: "",
    });
  });

  it("turns the typed wall time into a UTC instant in the event's zone", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/项目/), "1000m");
    await user.selectOptions(screen.getByLabelText("比赛日"), "2026-10-24");
    setValue(screen.getByLabelText(/开始时间/), "09:30");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      day: "2026-10-24",
      scheduledAt: "2026-10-24T13:30:00.000Z",
    });
  });

  it("derives a distance id from the label", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/项目/), "Super 1500m");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ distanceId: "super_1500m", label: "Super 1500m" });
  });

  it("refuses a time without a day", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/项目/), "500m");
    setValue(screen.getByLabelText(/开始时间/), "09:30");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("填写时间前请先选择比赛日")).toBeTruthy();
    expect(screen.getByLabelText(/开始时间/).getAttribute("aria-invalid")).toBe("true");
  });

  it("refuses a wall time that does not exist in the zone (clock change)", async () => {
    const { onSubmit, user } = setup({ event: { dates: ["2026-03-08"], timeZone: NY } });
    await user.type(screen.getByLabelText(/项目/), "500m");
    await user.selectOptions(screen.getByLabelText("比赛日"), "2026-03-08");
    setValue(screen.getByLabelText(/开始时间/), "02:30");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/不存在或格式不对/)).toBeTruthy();
  });

  it("tells the user the zone the time is calculated in", () => {
    setup();
    expect(screen.getByText(/America\/New_York/)).toBeTruthy();
  });

  it("without an event zone the time cannot be entered, and says why", () => {
    setup({ event: { dates: EVENT.dates, timeZone: null } });
    expect((screen.getByLabelText(/开始时间/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/没有设置时区/)).toBeTruthy();
  });

  it("without an event zone, editing keeps a time that was saved earlier", async () => {
    const { onSubmit, user } = setup({
      mode: "edit",
      event: { dates: EVENT.dates, timeZone: null },
      initial: {
        distanceId: "500m",
        label: "500m",
        sortOrder: 0,
        day: "2026-10-24",
        round: null,
        heat: null,
        scheduledAt: "2026-10-24T13:30:00.000Z",
        rosterIds: [],
        sourceNote: "",
      },
    });
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ scheduledAt: "2026-10-24T13:30:00.000Z" });
  });

  it("edit mode is prefilled, including the wall time in the event zone and chosen athletes", () => {
    setup({
      mode: "edit",
      roster: [rosterEntry({ rosterId: "r1", displayName: "Ann" }), rosterEntry({ rosterId: "r2", displayName: "Bo" })],
      initial: {
        distanceId: "500m",
        label: "500m",
        sortOrder: 2,
        day: "2026-10-25",
        round: "Final",
        heat: "2",
        scheduledAt: "2026-10-25T14:05:00.000Z",
        rosterIds: ["r2"],
        sourceNote: "list",
      },
    });
    expect(screen.getByRole("heading", { name: "编辑比赛" })).toBeTruthy();
    expect((screen.getByLabelText("比赛日") as HTMLSelectElement).value).toBe("2026-10-25");
    expect((screen.getByLabelText(/开始时间/) as HTMLInputElement).value).toBe("10:05");
    expect((screen.getByLabelText(/轮次/) as HTMLInputElement).value).toBe("Final");
    expect((screen.getByLabelText(/Bo/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Ann/) as HTMLInputElement).checked).toBe(false);
  });

  it("keeps a saved day selectable even when it is no longer one of the event's days", () => {
    setup({
      mode: "edit",
      initial: {
        distanceId: "500m",
        label: "500m",
        sortOrder: 0,
        day: "2026-10-30",
        round: null,
        heat: null,
        scheduledAt: null,
        rosterIds: [],
        sourceNote: "",
      },
    });
    expect((screen.getByLabelText("比赛日") as HTMLSelectElement).value).toBe("2026-10-30");
  });

  it("picks athletes with checkboxes and submits their ids", async () => {
    const { onSubmit, user } = setup({
      roster: [rosterEntry({ rosterId: "r1", displayName: "Ann" }), rosterEntry({ rosterId: "r2", displayName: "Bo" })],
    });
    await user.type(screen.getByLabelText(/项目/), "500m");
    await user.click(screen.getByLabelText(/Ann/));
    await user.click(screen.getByLabelText(/Bo/));
    await user.click(screen.getByLabelText(/Ann/));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ rosterIds: ["r2"] });
  });

  it("explains an empty roster", () => {
    setup();
    expect(screen.getByText(/名单还是空的/)).toBeTruthy();
  });

  it("rejects a sort order that is not a whole number, and uses the default when blank", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/项目/), "500m");
    await user.clear(screen.getByLabelText(/顺序/));
    await user.type(screen.getByLabelText(/顺序/), "abc");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/顺序/).getAttribute("aria-invalid")).toBe("true");

    await user.clear(screen.getByLabelText(/顺序/));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ sortOrder: 4 });
  });

  it("while saving: disables everything and ignores submit", () => {
    const { onSubmit } = setup({ saving: true });
    expect((screen.getByRole("button", { name: "保存中…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/项目/) as HTMLInputElement).disabled).toBe(true);
    screen.getByRole("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a save error and cancel does not submit", async () => {
    const { onSubmit, onCancel, user } = setup({ submitErrorKey: "raceDay.error.saveNetwork" });
    expect(screen.getByRole("alert").textContent).toContain("请检查网络");
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is translated to English", async () => {
    locale.current = "en";
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.getByLabelText("Race day")).toBeTruthy();
    locale.current = "zh";
  });
});
