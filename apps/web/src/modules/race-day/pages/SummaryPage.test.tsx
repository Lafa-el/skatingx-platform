// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry, RaceSummaryDoc } from "@skatingx/schema";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor, within } from "@/test/dom";

import type { ListState, SummaryDocState } from "../hooks/useRaceDayData";
import { SummaryPage } from "./SummaryPage";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const pro = vi.hoisted(() => ({ isPro: true, loading: false, error: null as string | null }));
vi.mock("@/hooks/useIsPro", () => ({ useIsPro: () => pro }));

const h = vi.hoisted(() => ({
  ctx: { db: {}, userId: "u1" } as unknown,
  events: null as unknown,
  roster: null as unknown,
  races: null as unknown,
  results: null as unknown,
  summary: null as unknown,
  summaryCalls: [] as (string | null)[],
  resultsCalls: [] as (string | null)[],
  actions: null as unknown,
  syncFailed: false,
  clearSyncFailed: undefined as unknown,
}));

vi.mock("../hooks/useRaceDayData", () => ({
  useRaceDayContext: () => h.ctx,
  useRaceEvents: () => h.events,
  useRoster: () => h.roster,
  useRaces: () => h.races,
  useRaceResults: (_ctx: unknown, eventId: string | null) => {
    h.resultsCalls.push(eventId);
    return h.results;
  },
  useRaceSummary: (_ctx: unknown, eventId: string | null) => {
    h.summaryCalls.push(eventId);
    return h.summary;
  },
}));
vi.mock("../hooks/useRaceDayActions", () => ({
  useRaceDayActions: () => ({
    actions: h.ctx ? h.actions : null,
    syncFailed: h.syncFailed,
    clearSyncFailed: h.clearSyncFailed,
  }),
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
const race = (over: Partial<RaceEntry> = {}): RaceEntry => ({
  raceId: "race-1",
  distanceId: "500m",
  label: "500m",
  sortOrder: 1,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: ["me", "other"],
  ...prov,
  ...over,
});
const athlete = (rosterId: string, displayName: string, isSelf: boolean): RaceRosterEntry => ({
  rosterId,
  displayName,
  bib: rosterId === "me" ? "7" : "8",
  division: "D",
  isSelf,
  isFollowed: !isSelf,
  athleteRefId: null,
  ...prov,
});
const me = athlete("me", "Me Skater", true);
const other = athlete("other", "Other Skater", false);
const result = (rosterId: string, over: Partial<RaceResult> = {}): RaceResult => ({
  resultId: `race-1_${rosterId}`,
  raceId: "race-1",
  rosterId,
  status: "finished",
  timeSeconds: 49.8,
  place: null,
  advanced: null,
  ...prov,
  ...over,
});
const note = (coachNote: string | null): RaceSummaryDoc => ({
  summaryVersion: "race-summary/1",
  generatedAt: "2026-10-24T16:30:00.000Z",
  coachNote,
  schemaVersion: 1,
  createdAt: "2026-10-24T16:00:00.000Z",
  updatedAt: "2026-10-24T16:30:00.000Z",
});

function ready<T>(items: T[], invalid: { id: string; reason: string }[] = []): ListState<T> {
  return { status: "ready", items, invalid, error: null };
}
const noSummary: SummaryDocState = { status: "ready", state: { kind: "none" }, error: null };
const withNote = (coachNote: string | null): SummaryDocState => ({
  status: "ready",
  state: { kind: "ready", summary: note(coachNote) },
  error: null,
});
const saved = { kind: "saved" } as const;

function makeActions() {
  return {
    saveSummaryNote: vi.fn().mockResolvedValue(saved),
    deleteSummary: vi.fn().mockResolvedValue(saved),
  };
}
const actions = () => h.actions as ReturnType<typeof makeActions>;

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
      <SummaryPage />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  installMemoryStorage();
  locale.current = "zh";
  pro.isPro = true;
  pro.loading = false;
  pro.error = null;
  h.ctx = { db: {}, userId: "u1" };
  h.events = ready([buffalo]);
  h.roster = ready([me, other]);
  h.races = ready([race()]);
  h.results = ready([]);
  h.summary = noSummary;
  h.summaryCalls = [];
  h.resultsCalls = [];
  h.actions = makeActions();
  h.syncFailed = false;
  h.clearSyncFailed = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const box = () => screen.getByLabelText("备注") as HTMLTextAreaElement;

describe("SummaryPage PRO gate", () => {
  it("a free user sees the locked card, and nothing is read: no summary and no results listener", () => {
    pro.isPro = false;
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("总结");
    expect(screen.getByText("这一页需要 PRO")).toBeTruthy();
    expect(h.summaryCalls).toEqual([]);
    expect(h.resultsCalls).toEqual([]);
    expect(screen.queryByLabelText("备注")).toBeNull();
  });

  it("while the plan loads, shows a preparing state and reads nothing", () => {
    pro.loading = true;
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("正在准备");
    expect(h.summaryCalls).toEqual([]);
  });

  it("a plan read error stays locked and reads nothing", () => {
    pro.error = "x";
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("暂时无法确认");
    expect(h.summaryCalls).toEqual([]);
  });

  it("a PRO user reads the selected event's summary", () => {
    renderPage();
    expect(h.summaryCalls).toContain("buffalo-1");
  });
});

describe("SummaryPage states", () => {
  it("shows the heading and a preparing message until the context is ready", () => {
    h.ctx = null;
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("总结");
    expect(screen.getByRole("status").textContent).toContain("正在准备数据");
  });

  it("explains a permission error loading events", () => {
    h.events = { status: "error", items: [], invalid: [], error: { code: "permission-denied", message: "x" } };
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("没有权限");
  });

  it("with no event, points to Setup", () => {
    h.events = ready([]);
    renderPage();
    expect(screen.getByText(/还没有赛事/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "去设置页" }).getAttribute("href")).toBe("/race-day/setup");
  });

  it("with no own athlete, says how to mark one and still allows the event note", () => {
    h.roster = ready([other]);
    renderPage();
    expect(screen.getByText(/还没有标记本人运动员/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "去设置页" }).getAttribute("href")).toBe("/race-day/setup");
    expect(screen.queryByTestId("pending-banner")).toBeNull();
    expect(box()).toBeTruthy();
  });

  it.each([
    ["races", () => (h.races = { status: "loading", items: [], invalid: [], error: null })],
    ["roster", () => (h.roster = { status: "loading", items: [], invalid: [], error: null })],
    ["results", () => (h.results = { status: "loading", items: [], invalid: [], error: null })],
    ["summary", () => (h.summary = { status: "loading", state: null, error: null })],
  ])("waits for the %s before showing the card or the editor", (_name, apply) => {
    apply();
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("正在准备数据");
    expect(screen.queryByLabelText("备注")).toBeNull();
    expect(screen.queryByTestId("pending-banner")).toBeNull();
  });

  it.each([
    ["races", () => (h.races = { status: "error", items: [], invalid: [], error: { code: "unavailable", message: "x" } })],
    ["results", () => (h.results = { status: "error", items: [], invalid: [], error: { code: "unavailable", message: "x" } })],
    ["roster", () => (h.roster = { status: "error", items: [], invalid: [], error: { code: "permission-denied", message: "x" } })],
    ["summary", () => (h.summary = { status: "error", state: null, error: { code: "permission-denied", message: "x" } })],
  ])("shows a %s load error and no editor", (_name, apply) => {
    apply();
    renderPage();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByLabelText("备注")).toBeNull();
  });

  it("counts unreadable documents", () => {
    h.races = ready([race()], [{ id: "b", reason: "x" }]);
    h.results = ready([], [{ id: "d", reason: "x" }]);
    renderPage();
    expect(screen.getByText("有 2 条数据无法读取,已隐藏。")).toBeTruthy();
  });

  it("shows the sync-failed alert and dismisses it", async () => {
    h.syncFailed = true;
    const user = renderPage();
    expect(screen.getByRole("alert").textContent).toContain("未能同步");
    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(h.clearSyncFailed).toHaveBeenCalled();
  });
});

describe("SummaryPage card", () => {
  it("is about the own athlete only: a followed athlete's results are not counted", () => {
    h.results = ready([result("me", { timeSeconds: 50 }), result("other", { timeSeconds: 40 })]);
    renderPage();
    expect(screen.getByRole("heading", { name: "Me Skater 的比赛总结" })).toBeTruthy();
    expect(screen.getByTestId("pending-banner").textContent).toContain("1 项成绩仍待确认");
    expect(screen.getByText("50.00")).toBeTruthy();
    expect(screen.queryByText("40.00")).toBeNull();
    expect(screen.queryByText("Other Skater")).toBeNull();
  });

  it("recomputes from the live results and keeps the fastest to confirmed ones", () => {
    h.races = ready([race(), race({ raceId: "race-2", label: "1000m", sortOrder: 2, rosterIds: ["me"] })]);
    h.results = ready([
      result("me", { timeSeconds: 40 }),
      { ...result("me", { timeSeconds: 99, verification: "verified" }), raceId: "race-2", resultId: "race-2_me" },
    ]);
    renderPage();
    const fastest = screen.getByText("最快完赛时间(仅统计已确认成绩)").closest("div") as HTMLElement;
    expect(within(fastest).getByText("1:39.00")).toBeTruthy();
    expect(screen.getByTestId("pending-banner").textContent).toContain("1 项成绩仍待确认");
  });

  it("with several own athletes shows which one the card is for", () => {
    h.roster = ready([me, athlete("zed", "Zed Skater", true)]);
    renderPage();
    expect(screen.getByText("有多位运动员被标记为本人,这里显示的是 Me Skater。")).toBeTruthy();
  });
});

describe("SummaryPage note", () => {
  it("creates the note when there is none yet", async () => {
    const user = renderPage();
    await user.type(box(), "Tired in the last lap");
    await user.click(screen.getByRole("button", { name: "保存备注" }));
    await waitFor(() => {
      expect(actions().saveSummaryNote).toHaveBeenCalledTimes(1);
    });
    expect(actions().saveSummaryNote).toHaveBeenCalledWith("buffalo-1", "Tired in the last lap", false);
  });

  it("updates the note when one is already saved", async () => {
    h.summary = withNote("first");
    const user = renderPage();
    await user.type(box(), " and more");
    await user.click(screen.getByRole("button", { name: "保存备注" }));
    await waitFor(() => {
      expect(actions().saveSummaryNote).toHaveBeenCalledWith("buffalo-1", "first and more", true);
    });
  });

  it("an unreadable saved note is hidden and cannot be overwritten, only deleted", async () => {
    h.summary = { status: "ready", state: { kind: "invalid", reason: "x" }, error: null };
    const user = renderPage();
    expect(screen.getByText(/无法读取,已隐藏/)).toBeTruthy();
    expect(screen.queryByLabelText("备注")).toBeNull();
    await user.click(screen.getByRole("button", { name: "删除总结备注" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => {
      expect(actions().deleteSummary).toHaveBeenCalledWith("buffalo-1");
    });
  });

  it("deletes the note after confirmation", async () => {
    h.summary = withNote("first");
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: "删除总结备注" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => {
      expect(actions().deleteSummary).toHaveBeenCalledWith("buffalo-1");
    });
  });

  it("keeps the text and shows a message when saving fails", async () => {
    actions().saveSummaryNote.mockRejectedValue(Object.assign(new Error("denied"), { code: "permission-denied" }));
    const user = renderPage();
    await user.type(box(), "keep me");
    await user.click(screen.getByRole("button", { name: "保存备注" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("权限");
    });
    expect(box().value).toBe("keep me");
  });

  it("tells the user a write is saved on the device when it is only queued", async () => {
    actions().saveSummaryNote.mockResolvedValue({ kind: "queued" });
    const user = renderPage();
    await user.type(box(), "offline note");
    await user.click(screen.getByRole("button", { name: "保存备注" }));
    await waitFor(() => {
      expect(screen.getByText(/已保存在本机/)).toBeTruthy();
    });
  });

  it("shows an error when deleting fails", async () => {
    actions().deleteSummary.mockRejectedValue(Object.assign(new Error("x"), { code: "unavailable" }));
    h.summary = withNote("first");
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: "删除总结备注" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("a draft typed for one event does not carry over to another event", async () => {
    h.events = ready([buffalo, { ...buffalo, eventId: "cup-2", name: "Second Cup" }]);
    const user = renderPage();
    await user.type(box(), "only for buffalo");
    await user.selectOptions(screen.getByLabelText("当前赛事"), "cup-2");
    expect(box().value).toBe("");
    expect(h.summaryCalls).toContain("cup-2");
  });

  it("deleting clears an earlier save error", async () => {
    actions().saveSummaryNote.mockRejectedValue(Object.assign(new Error("x"), { code: "permission-denied" }));
    h.summary = withNote("first");
    const user = renderPage();
    await user.type(box(), "!");
    await user.click(screen.getByRole("button", { name: "保存备注" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "删除总结备注" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("does not call the repository for an over-long note", async () => {
    const user = renderPage();
    await user.click(box());
    await user.paste("n".repeat(2001));
    await user.click(screen.getByRole("button", { name: "保存备注" }));
    expect(actions().saveSummaryNote).not.toHaveBeenCalled();
    expect(screen.getByText("内容太长,请缩短")).toBeTruthy();
  });

  it("logs a failed save without the note text", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    actions().saveSummaryNote.mockRejectedValue(Object.assign(new Error("Private note text"), { code: "unavailable" }));
    const user = renderPage();
    await user.type(box(), "Private note text");
    await user.click(screen.getByRole("button", { name: "保存备注" }));
    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("Private note text");
  });

  it("has no video player, file chooser or link in the page", () => {
    h.summary = withNote("first");
    h.results = ready([result("me")]);
    renderPage();
    expect(document.querySelector("video, input[type=file], iframe")).toBeNull();
  });
});

describe("SummaryPage in English", () => {
  it("uses English labels", () => {
    locale.current = "en";
    h.results = ready([result("me")]);
    h.summary = withNote("Hello");
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Summary");
    expect(screen.getByRole("heading", { name: "Race summary for Me Skater" })).toBeTruthy();
    expect(screen.getByLabelText("Note")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save note" })).toBeTruthy();
  });

  it("the locked card is in English too", () => {
    locale.current = "en";
    pro.isPro = false;
    renderPage();
    expect(screen.getByText("This page needs PRO")).toBeTruthy();
  });
});
