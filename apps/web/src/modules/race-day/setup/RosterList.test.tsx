// @vitest-environment happy-dom
import type { RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";

import { RosterList } from "./RosterList";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

function entry(over: Partial<RaceRosterEntry>): RaceRosterEntry {
  return {
    rosterId: "r1",
    displayName: "Lindsay",
    bib: "134",
    division: "Division 6 Wings",
    isSelf: false,
    isFollowed: false,
    athleteRefId: null,
    verification: "pending",
    source: "manual",
    sourceNote: "",
    verifiedAt: null,
    schemaVersion: 1,
    ...over,
  };
}

function setup(entries: RaceRosterEntry[], busy = false) {
  const handlers = { onEdit: vi.fn(), onSetVerified: vi.fn(), onDelete: vi.fn() };
  render(<RosterList entries={entries} busy={busy} {...handlers} />);
  return { ...handlers, user: userEvent.setup() };
}

describe("RosterList", () => {
  it("shows an empty state", () => {
    setup([]);
    expect(screen.getByText(/名单还是空的/)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists my own athlete first, then followed, then others", () => {
    setup([
      entry({ rosterId: "a", displayName: "Amy" }),
      entry({ rosterId: "f", displayName: "Fay", isFollowed: true }),
      entry({ rosterId: "s", displayName: "Zoe", isSelf: true }),
    ]);
    const names = within(screen.getByRole("list"))
      .getAllByRole("listitem")
      .map((li) => li.querySelector("span")?.textContent);
    expect(names).toEqual(["Zoe", "Fay", "Amy"]);
  });

  it("shows bib, division, role chips and the pending marker", () => {
    setup([entry({ isSelf: true })]);
    expect(screen.getByText(/号码 134/)).toBeTruthy();
    expect(screen.getByText(/Division 6 Wings/)).toBeTruthy();
    expect(screen.getByText("本人")).toBeTruthy();
    expect(screen.getByText("待确认")).toBeTruthy();
  });

  it("offers 'mark verified' for pending and passes the next value", async () => {
    const e = entry({});
    const { onSetVerified, user } = setup([e]);
    await user.click(screen.getByRole("button", { name: /标记为已确认/ }));
    expect(onSetVerified).toHaveBeenCalledWith(e, true);
  });

  it("offers 'return to pending' for verified and passes false", async () => {
    const e = entry({ verification: "verified" });
    const { onSetVerified, user } = setup([e]);
    expect(screen.getByText("已确认")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /退回待确认/ }));
    expect(onSetVerified).toHaveBeenCalledWith(e, false);
  });

  it("edit passes the entry", async () => {
    const e = entry({});
    const { onEdit, user } = setup([e]);
    await user.click(screen.getByRole("button", { name: /编辑 Lindsay/ }));
    expect(onEdit).toHaveBeenCalledWith(e);
  });

  it("delete needs a second confirmation and can be cancelled", async () => {
    const e = entry({});
    const { onDelete, user } = setup([e]);
    await user.click(screen.getByRole("button", { name: /删除 Lindsay/ }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /删除 Lindsay/ }));
    await user.click(screen.getByRole("button", { name: /确认删除 Lindsay/ }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(e);
  });

  it("disables the actions while another write is in progress", () => {
    setup([entry({})], true);
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
