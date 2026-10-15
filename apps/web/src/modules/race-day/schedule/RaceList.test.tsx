// @vitest-environment happy-dom
import type { RaceEntry, RaceRosterEntry } from "@skatingx/schema";
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";

import { RaceList } from "./RaceList";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const prov = {
  verification: "pending" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1 as const,
};

function race(over: Partial<RaceEntry>): RaceEntry {
  return {
    raceId: "r",
    distanceId: "500m",
    label: "500m",
    sortOrder: 0,
    day: null,
    round: null,
    heat: null,
    scheduledAt: null,
    rosterIds: [],
    ...prov,
    ...over,
  };
}

const ann: RaceRosterEntry = {
  rosterId: "ann",
  displayName: "Ann",
  bib: "1",
  division: "D",
  isSelf: true,
  isFollowed: false,
  athleteRefId: null,
  ...prov,
};

function setup(races: RaceEntry[], opts: { timeZone?: string | null; busy?: boolean } = {}) {
  const handlers = { onEdit: vi.fn(), onSetVerified: vi.fn(), onDelete: vi.fn() };
  render(
    <RaceList
      races={races}
      roster={[ann]}
      timeZone={opts.timeZone === undefined ? "America/New_York" : opts.timeZone}
      busy={opts.busy ?? false}
      {...handlers}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

describe("RaceList", () => {
  it("groups by day with unknown days in their own group, last", () => {
    setup([
      race({ raceId: "a", label: "A", day: null }),
      race({ raceId: "b", label: "B", day: "2026-10-25" }),
      race({ raceId: "c", label: "C", day: "2026-10-24" }),
    ]);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toHaveLength(3);
    expect(headings[0]).toMatch(/24/);
    expect(headings[1]).toMatch(/25/);
    expect(headings[2]).toBe("比赛日待定");
  });

  it("numbers races across the whole schedule and keeps two 500m races apart", () => {
    setup([
      race({ raceId: "a", label: "500m", sortOrder: 0 }),
      race({ raceId: "b", label: "500m", sortOrder: 1 }),
      race({ raceId: "c", label: "1000m", sortOrder: 2 }),
    ]);
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText("#3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /编辑 500m #1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /编辑 500m #2/ })).toBeTruthy();
  });

  it("shows the pending marker and 'time to be confirmed' for an unknown time", () => {
    setup([race({})]);
    expect(screen.getByText("待确认")).toBeTruthy();
    expect(screen.getByText("时间待定")).toBeTruthy();
  });

  it("shows a known time in the event zone with the zone name", () => {
    locale.current = "en";
    setup([race({ day: "2026-10-24", scheduledAt: "2026-10-24T13:30:00.000Z" })]);
    expect(screen.getByText(/9:30\s?AM\s?EDT/)).toBeTruthy();
    locale.current = "zh";
  });

  it("with no event zone, labels a known time as UTC instead of guessing", () => {
    setup([race({ day: "2026-10-24", scheduledAt: "2026-10-24T13:30:00.000Z" })], { timeZone: null });
    expect(screen.getByText(/UTC/)).toBeTruthy();
  });

  it("lists athlete names, 'unknown athlete' for a missing one, and 'none assigned'", () => {
    setup([
      race({ raceId: "a", label: "A", rosterIds: ["ann", "ghost"], sortOrder: 0 }),
      race({ raceId: "b", label: "B", rosterIds: [], sortOrder: 1 }),
    ]);
    expect(screen.getByText("Ann, 未知运动员")).toBeTruthy();
    expect(screen.getByText("未指派运动员")).toBeTruthy();
  });

  it("shows round and heat when present", () => {
    setup([race({ round: "Final", heat: "2" })]);
    expect(screen.getByText("轮次 Final")).toBeTruthy();
    expect(screen.getByText("第 2 组")).toBeTruthy();
  });

  it("toggles verification to the next value", async () => {
    const pending = race({});
    const { onSetVerified, user } = setup([pending]);
    await user.click(screen.getByRole("button", { name: /标记为已确认/ }));
    expect(onSetVerified).toHaveBeenCalledWith(pending, true);
  });

  it("offers to return a verified race to pending", async () => {
    const verified = race({ verification: "verified" });
    const { onSetVerified, user } = setup([verified]);
    expect(screen.getByText("已确认")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /退回待确认/ }));
    expect(onSetVerified).toHaveBeenCalledWith(verified, false);
  });

  it("edit passes the race; delete needs a second confirmation", async () => {
    const r = race({});
    const { onEdit, onDelete, user } = setup([r]);
    await user.click(screen.getByRole("button", { name: /编辑/ }));
    expect(onEdit).toHaveBeenCalledWith(r);

    await user.click(screen.getByRole("button", { name: /^删除/ }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    await user.click(screen.getByRole("button", { name: /确认删除/ }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(r);
  });

  it("the delete confirmation says the race's results are deleted too, and cannot be recovered", async () => {
    const { user } = setup([race({})]);
    expect(screen.queryByText(/所有成绩/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    const warning = screen.getByRole("alert");
    expect(warning.textContent).toContain("所有成绩");
    expect(warning.textContent).toContain("无法恢复");
    expect(warning.textContent).toContain("视频记录");
    expect(warning.textContent).toContain("视频文件本身不受影响");
  });

  it("disables actions while another write is running", () => {
    setup([race({})], { busy: true });
    const list = screen.getByRole("list");
    for (const b of within(list).getAllByRole("button")) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
