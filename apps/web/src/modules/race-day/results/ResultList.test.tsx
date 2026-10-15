// @vitest-environment happy-dom
import type { RaceEntry, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";

import { buildResultViews } from "../lib/results";
import { ResultList } from "./ResultList";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const prov = {
  verification: "pending" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1 as const,
  createdAt: "2026-10-24T10:00:00.000Z",
  updatedAt: "2026-10-24T10:00:00.000Z",
};

const race1: RaceEntry = {
  raceId: "race-1",
  distanceId: "500m",
  label: "500m",
  sortOrder: 1,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: ["ann"],
  ...prov,
};

const ann: RaceRosterEntry = {
  rosterId: "ann",
  displayName: "Ann",
  bib: "7",
  division: "D",
  isSelf: true,
  isFollowed: false,
  athleteRefId: null,
  ...prov,
};
const bob: RaceRosterEntry = { ...ann, rosterId: "bob", displayName: "Bob", bib: "8", isSelf: false };

function result(rosterId: string, over: Partial<RaceResult> = {}): RaceResult {
  return {
    resultId: `race-1_${rosterId}`,
    raceId: "race-1",
    rosterId,
    status: "finished",
    timeSeconds: 49.8,
    place: null,
    advanced: null,
    ...prov,
    ...over,
  };
}

function setup(results: RaceResult[], opts: { races?: RaceEntry[]; roster?: RaceRosterEntry[]; busy?: boolean } = {}) {
  const handlers = { onEdit: vi.fn(), onSetVerified: vi.fn(), onDelete: vi.fn() };
  const views = buildResultViews(results, opts.races ?? [race1], opts.roster ?? [ann, bob]);
  render(<ResultList views={views} busy={opts.busy ?? false} {...handlers} />);
  return { ...handlers, user: userEvent.setup() };
}

const item = (name: string) => {
  const found = screen.getAllByRole("listitem").find((li) => within(li).queryByText(name));
  if (!found) {
    throw new Error(`no list item for ${name}`);
  }
  return found;
};

describe("ResultList", () => {
  it("shows the athlete, bib, race and the time with its third decimal", () => {
    setup([result("ann", { timeSeconds: 49.123 })]);
    const li = item("Ann");
    expect(within(li).getByText("#7")).toBeTruthy();
    expect(within(li).getByText("#1 500m")).toBeTruthy();
    expect(within(li).getByText("49.123")).toBeTruthy();
  });

  it("shows times with two decimals, minutes when needed", () => {
    setup([result("ann", { timeSeconds: 49.8 }), result("bob", { timeSeconds: 104.23 })]);
    expect(screen.getByText("49.80")).toBeTruthy();
    expect(screen.getByText("1:44.23")).toBeTruthy();
  });

  it("every result carries a visible pending marker, and verified ones say so", () => {
    setup([result("ann"), result("bob", { verification: "verified", verifiedAt: "2026-10-24T11:00:00.000Z" })]);
    expect(within(item("Ann")).getByText("待确认")).toBeTruthy();
    expect(within(item("Bob")).getByText("已确认")).toBeTruthy();
  });

  it("shows place and advancement, and nothing for unknown", () => {
    setup([
      result("ann", { place: 2, advanced: true }),
      result("bob", { place: 5, advanced: false }),
    ]);
    expect(within(item("Ann")).getByText("第 2 名")).toBeTruthy();
    expect(within(item("Ann")).getByText("晋级")).toBeTruthy();
    expect(within(item("Bob")).getByText("未晋级")).toBeTruthy();
  });

  it("shows nothing about place or advancement when they are unknown", () => {
    setup([result("ann")]);
    const li = item("Ann");
    expect(within(li).queryByText(/名次|第 .* 名/)).toBeNull();
    expect(within(li).queryByText("晋级")).toBeNull();
    expect(within(li).queryByText("未晋级")).toBeNull();
  });

  it.each([
    ["DNS", "未出发(DNS)"],
    ["DNF", "未完赛(DNF)"],
    ["DQ", "取消资格(DQ)"],
  ] as const)("shows %s as text instead of a time", (status, text) => {
    setup([result("ann", { status, timeSeconds: null })]);
    expect(within(item("Ann")).getByText(text)).toBeTruthy();
  });

  it("explains a result whose athlete is no longer on the race, and keeps it", () => {
    setup([result("bob")]);
    const li = item("Bob");
    expect(within(li).getByText("该运动员已不在这场比赛名单中")).toBeTruthy();
    expect(within(li).getByText("49.80")).toBeTruthy();
  });

  it("does not show that note for an athlete who is on the race", () => {
    setup([result("ann")]);
    expect(screen.queryByText("该运动员已不在这场比赛名单中")).toBeNull();
  });

  it("labels an unknown race and athlete instead of hiding the result, and offers no edit for a missing race", () => {
    setup([result("zed", { raceId: "race-9", resultId: "race-9_zed" })]);
    const li = item("未知运动员");
    expect(within(li).getByText("未知比赛")).toBeTruthy();
    expect(within(li).queryByRole("button", { name: /^编辑/ })).toBeNull();
    expect(within(li).getByRole("button", { name: /^退回待确认|^标记为已确认/ })).toBeTruthy();
    expect(within(li).getByRole("button", { name: /^删除/ })).toBeTruthy();
  });

  it("shows the source note", () => {
    setup([result("ann", { sourceNote: "board photo" })]);
    expect(screen.getByText("board photo")).toBeTruthy();
  });

  it("buttons say which result they act on", () => {
    setup([result("ann"), result("bob")]);
    expect(screen.getByRole("button", { name: "编辑 #1 500m Ann" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "编辑 #1 500m Bob" })).toBeTruthy();
  });

  it("edit and verify report the right result", async () => {
    const { onEdit, onSetVerified, user } = setup([result("ann"), result("bob", { verification: "verified", verifiedAt: "2026-10-24T11:00:00.000Z" })]);
    await user.click(within(item("Ann")).getByRole("button", { name: /^编辑/ }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ resultId: "race-1_ann" }) }));

    await user.click(within(item("Ann")).getByRole("button", { name: /^标记为已确认/ }));
    expect(onSetVerified).toHaveBeenLastCalledWith(expect.objectContaining({ result: expect.objectContaining({ resultId: "race-1_ann" }) }), true);

    await user.click(within(item("Bob")).getByRole("button", { name: /^退回待确认/ }));
    expect(onSetVerified).toHaveBeenLastCalledWith(expect.objectContaining({ result: expect.objectContaining({ resultId: "race-1_bob" }) }), false);
  });

  it("deleting takes two steps and warns that it cannot be undone", async () => {
    const { onDelete, user } = setup([result("ann"), result("bob")]);
    await user.click(within(item("Ann")).getByRole("button", { name: /^删除/ }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(within(item("Ann")).getByText("删除这条成绩,无法恢复。")).toBeTruthy();
    await user.click(within(item("Ann")).getByRole("button", { name: /^确认删除/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ resultId: "race-1_ann" }) }));
  });

  it("cancelling the delete confirmation deletes nothing and restores the buttons", async () => {
    const { onDelete, user } = setup([result("ann")]);
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^编辑/ })).toBeTruthy();
    expect(screen.queryByText("删除这条成绩,无法恢复。")).toBeNull();
  });

  it("disables the actions while another action is running", () => {
    setup([result("ann")], { busy: true });
    for (const name of [/^编辑/, /^标记为已确认/, /^删除/]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("is a polite live region so an entry from another device is announced", () => {
    setup([result("ann")]);
    expect(screen.getByRole("list").getAttribute("aria-live")).toBe("polite");
  });

  it("renders in English", () => {
    locale.current = "en";
    try {
      setup([result("ann", { place: 1, advanced: true }), result("bob", { status: "DNF", timeSeconds: null })]);
      expect(within(item("Ann")).getByText("Pending")).toBeTruthy();
      expect(within(item("Ann")).getByText("Place 1")).toBeTruthy();
      expect(within(item("Ann")).getByText("Advanced")).toBeTruthy();
      expect(within(item("Bob")).getByText("Did not finish (DNF)")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Edit #1 500m Ann" })).toBeTruthy();
    } finally {
      locale.current = "zh";
    }
  });
});
