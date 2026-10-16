// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";

import type { ListState } from "../hooks/useRaceDayData";
import { TodayPage } from "./TodayPage";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const h = vi.hoisted(() => ({
  ctx: { db: {}, userId: "u1" } as unknown,
  events: null as unknown,
  roster: null as unknown,
  races: null as unknown,
  results: null as unknown,
  now: "2026-10-24T16:00:00.000Z",
}));

vi.mock("../hooks/useNowIso", () => ({ useNowIso: () => h.now }));
vi.mock("../hooks/useRaceDayData", () => ({
  useRaceDayContext: () => h.ctx,
  useRaceEvents: () => h.events,
  useRoster: () => h.roster,
  useRaces: () => h.races,
  useRaceResults: () => h.results,
}));

const prov = {
  verification: "pending" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1 as const,
  createdAt: "2026-10-24T10:00:00.000Z",
  updatedAt: "2026-10-24T10:00:00.000Z",
};

const buffalo: RaceEvent = {
  eventId: "buffalo-1",
  name: "Buffalo Championships",
  dates: ["2026-10-24", "2026-10-25"],
  timeZone: "America/New_York",
  venue: null,
  ...prov,
};
const race = (raceId: string, over: Partial<RaceEntry> = {}): RaceEntry => ({
  raceId,
  distanceId: "500m",
  label: raceId.toUpperCase(),
  sortOrder: 0,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: ["me"],
  ...prov,
  ...over,
});
const athlete = (rosterId: string, displayName: string, isSelf: boolean): RaceRosterEntry => ({
  rosterId,
  displayName,
  bib: "7",
  division: "D",
  isSelf,
  isFollowed: !isSelf,
  athleteRefId: null,
  ...prov,
});
const me = athlete("me", "Me Skater", true);
const other = athlete("other", "Other Skater", false);
const result = (raceId: string, rosterId: string, over: Partial<RaceResult> = {}): RaceResult => ({
  resultId: `${raceId}_${rosterId}`,
  raceId,
  rosterId,
  status: "finished",
  timeSeconds: 49.8,
  place: null,
  advanced: null,
  ...prov,
  ...over,
});

function ready<T>(items: T[], invalid: { id: string; reason: string }[] = []): ListState<T> {
  return { status: "ready", items, invalid, error: null };
}
const loadingList = { status: "loading", items: [], invalid: [], error: null };
const errorList = (code: string) => ({ status: "error", items: [], invalid: [], error: { code, message: "x" } });

function installMemoryStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    },
    configurable: true,
  });
}

function renderPage() {
  render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  installMemoryStorage();
  locale.current = "zh";
  h.ctx = { db: {}, userId: "u1" };
  h.events = ready([buffalo]);
  h.roster = ready([me, other]);
  h.races = ready([
    race("r1", { sortOrder: 1, scheduledAt: "2026-10-24T13:30:00.000Z", rosterIds: ["me", "other"] }),
    race("r2", { sortOrder: 2 }),
  ]);
  h.results = ready([]);
  h.now = "2026-10-24T16:00:00.000Z";
});

describe("TodayPage states", () => {
  it("shows the heading and a preparing message until the context is ready", () => {
    h.ctx = null;
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("今天");
    expect(screen.getByRole("status").textContent).toContain("正在准备数据");
  });

  it("waits while events load", () => {
    h.events = loadingList;
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("正在准备数据");
  });

  it("explains a permission error loading events", () => {
    h.events = errorList("permission-denied");
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("没有权限");
  });

  it("with no event, points to Setup", () => {
    h.events = ready([]);
    renderPage();
    expect(screen.getByText(/还没有赛事/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "去设置页" }).getAttribute("href")).toBe("/race-day/setup");
  });

  it.each([
    ["races", () => (h.races = loadingList)],
    ["roster", () => (h.roster = loadingList)],
    ["results", () => (h.results = loadingList)],
  ])("waits for the %s before showing the board", (_name, apply) => {
    apply();
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("正在准备数据");
    expect(screen.queryByTestId("next-race")).toBeNull();
  });

  it.each([
    ["races", () => (h.races = errorList("unavailable"))],
    ["roster", () => (h.roster = errorList("permission-denied"))],
    ["results", () => (h.results = errorList("unavailable"))],
  ])("shows a %s load error and no board", (_name, apply) => {
    apply();
    renderPage();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("next-race")).toBeNull();
  });

  it("counts unreadable documents", () => {
    h.races = ready([race("r1")], [{ id: "b", reason: "x" }]);
    h.results = ready([], [{ id: "d", reason: "x" }]);
    renderPage();
    expect(screen.getByText("有 2 条数据无法读取,已隐藏。")).toBeTruthy();
  });

  it("is read-only: no field, no button, only links and the event choice", () => {
    h.events = ready([buffalo, { ...buffalo, eventId: "cup-2", name: "Second Cup" }]);
    renderPage();
    expect(document.querySelectorAll("input, textarea, button, form")).toHaveLength(0);
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });
});

describe("TodayPage on a race day", () => {
  it("shows the event, its days and zone, and marks everything unconfirmed as pending", () => {
    renderPage();
    expect(screen.getByText("Buffalo Championships")).toBeTruthy();
    expect(screen.getByText(/时区:America\/New_York/)).toBeTruthy();
    expect(screen.getByText("比赛日:10月24日周六、10月25日周日")).toBeTruthy();
    expect(screen.getByText("今天是比赛日。")).toBeTruthy();
    // The event and the races carry the pending marker, not a confirmed tone.
    expect(document.querySelectorAll("[data-verification=pending]").length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector("[data-verification=verified]")).toBeNull();
  });

  it("the next race is the first of the own athlete without a result, shown in the event's zone", () => {
    h.results = ready([result("r1", "me")]);
    renderPage();
    const next = screen.getByTestId("next-race");
    expect(within(next).getByText("#2")).toBeTruthy();
    expect(within(next).getByText("R2")).toBeTruthy();
    expect(within(next).getByText("我的比赛")).toBeTruthy();
    expect(screen.getByText(/不是按时钟判断/)).toBeTruthy();
  });

  it("lists the day's races in order with the time in the event's zone, or 'time to be confirmed'", () => {
    renderPage();
    const list = screen.getByRole("heading", { level: 2, name: /的比赛$/ }).closest("section") as HTMLElement;
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText(/9:30.*GMT-4|GMT-4.*9:30/)).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("时间待定")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("Me Skater, Other Skater")).toBeTruthy();
  });

  it("says which races have a result entered", () => {
    h.results = ready([result("r1", "me")]);
    renderPage();
    const list = screen.getByRole("heading", { level: 2, name: /的比赛$/ }).closest("section") as HTMLElement;
    const rows = within(list).getAllByRole("listitem");
    expect(within(rows[0] as HTMLElement).getByText("已录入成绩")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("还没有成绩")).toBeTruthy();
  });

  it("shows the pending count prominently and links to Results; hidden when nothing is pending", () => {
    h.results = ready([result("r1", "me"), result("r2", "me", { verification: "verified" })]);
    renderPage();
    const banner = screen.getByTestId("pending-banner");
    expect(banner.textContent).toContain("1 项成绩仍待确认");
    expect(within(banner).getByRole("link", { name: "成绩" }).getAttribute("href")).toBe("/race-day/results");
  });

  it("no pending banner when every result is confirmed or none exist", () => {
    renderPage();
    expect(screen.queryByTestId("pending-banner")).toBeNull();
  });

  it("when every race has a result it says so instead of inventing a next race", () => {
    h.results = ready([result("r1", "me"), result("r2", "me")]);
    renderPage();
    expect(screen.queryByTestId("next-race")).toBeNull();
    expect(screen.getByText("这一天需要关注的比赛都已录入成绩。")).toBeTruthy();
  });

  it("with no races on the day, points to Schedule and lists no races", () => {
    h.races = ready([race("r1", { day: "2026-10-25" })]);
    renderPage();
    expect(screen.getByText(/这一天还没有安排比赛/)).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: /的比赛$/ })).toBeNull();
  });

  it("says nothing about undated races when there are none", () => {
    renderPage();
    expect(screen.queryByText(/没有日期/)).toBeNull();
  });

  it("an event without days still shows, with no days line and an explanation", () => {
    h.events = ready([{ ...buffalo, dates: [] }]);
    renderPage();
    expect(screen.queryByText(/比赛日:/)).toBeNull();
    expect(screen.getByText(/还没有设置比赛日期/)).toBeTruthy();
  });

  it("when the own athlete is on none of the races, says so", () => {
    h.races = ready([race("r1", { rosterIds: ["other"] })]);
    renderPage();
    expect(screen.getByText("这一天没有安排本人的比赛。")).toBeTruthy();
  });

  it("with no own athlete, shows everyone and says so", () => {
    h.roster = ready([other]);
    renderPage();
    expect(screen.getByText("还没有标记本人运动员,这里按所有运动员显示。")).toBeTruthy();
    expect(screen.queryByText("我的比赛")).toBeNull();
  });

  it("with several own athletes, names the one shown", () => {
    h.roster = ready([me, athlete("zed", "Zed Skater", true)]);
    renderPage();
    expect(screen.getByText("有多位运动员被标记为本人,这里按 Me Skater 显示。")).toBeTruthy();
  });

  it("mentions races that have no day, without placing them on a day", () => {
    h.races = ready([race("r1"), race("u1", { day: null })]);
    renderPage();
    expect(screen.getByText(/还有 1 场比赛没有日期/)).toBeTruthy();
  });

  it("offers links to the other tabs", () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "去其他页面" });
    expect(within(nav).getByRole("link", { name: "赛程" }).getAttribute("href")).toBe("/race-day/schedule");
    expect(within(nav).getByRole("link", { name: "总结" }).getAttribute("href")).toBe("/race-day/summary");
  });

  it("switching the event shows that event's day", async () => {
    h.events = ready([buffalo, { ...buffalo, eventId: "cup-2", name: "Second Cup" }]);
    const user = renderPage();
    await user.selectOptions(screen.getByLabelText("当前赛事"), "cup-2");
    // The option in the picker plus the event title now shown on the page.
    expect(screen.getAllByText("Second Cup")).toHaveLength(2);
    expect((screen.getByLabelText("当前赛事") as HTMLSelectElement).value).toBe("cup-2");
  });
});

describe("TodayPage around the event", () => {
  it("before the event: counts the days and previews the first day", () => {
    h.now = "2026-10-16T12:00:00.000Z";
    renderPage();
    expect(screen.getByText(/距离比赛还有 8 天/)).toBeTruthy();
    expect(screen.getByTestId("next-race")).toBeTruthy();
  });

  it("the evening before in New York is still 'before', not race day (event zone, not UTC)", () => {
    h.now = "2026-10-24T03:30:00.000Z";
    renderPage();
    expect(screen.getByText(/距离比赛还有 1 天/)).toBeTruthy();
  });

  it("after the event: points to Results and Summary, lists no races", () => {
    h.now = "2026-11-02T12:00:00.000Z";
    renderPage();
    expect(screen.getByText(/赛事已经结束/)).toBeTruthy();
    expect(screen.queryByTestId("next-race")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /的比赛$/ })).toBeNull();
  });

  it("with no time zone it does not guess a day and says so", () => {
    h.events = ready([{ ...buffalo, timeZone: null }]);
    renderPage();
    expect(screen.getByText(/还没有设置时区,无法判断哪一天是今天/)).toBeTruthy();
    expect(screen.getByText("时区待确认")).toBeTruthy();
    expect(screen.queryByTestId("next-race")).toBeNull();
  });

  it("with an unreadable zone name it says so", () => {
    h.events = ready([{ ...buffalo, timeZone: "Not/AZone" }]);
    renderPage();
    expect(screen.getByText(/时区无法识别/)).toBeTruthy();
  });
});

describe("TodayPage in English", () => {
  it("uses English labels", () => {
    locale.current = "en";
    h.results = ready([result("r1", "me")]);
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Today");
    expect(screen.getByText("Today is a race day.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Next race" })).toBeTruthy();
    expect(screen.getByTestId("pending-banner").textContent).toContain("1 result(s) still pending");
    expect(screen.getAllByText("Time to be confirmed").length).toBeGreaterThan(0);
  });

  it("before the event, English countdown", () => {
    locale.current = "en";
    h.now = "2026-10-16T12:00:00.000Z";
    renderPage();
    expect(screen.getByText(/8 day\(s\) until the event/)).toBeTruthy();
  });
});
