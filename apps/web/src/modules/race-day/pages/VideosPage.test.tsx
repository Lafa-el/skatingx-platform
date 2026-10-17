// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceRosterEntry, RaceVideoRef } from "@skatingx/schema";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor, within } from "@/test/dom";

import type { ListState } from "../hooks/useRaceDayData";
import { VideosPage } from "./VideosPage";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const pro = vi.hoisted(() => ({ isPro: true, loading: false, error: null as string | null }));
vi.mock("@/hooks/useIsPro", () => ({ useIsPro: () => pro }));

const h = vi.hoisted(() => ({
  ctx: { db: {}, userId: "u1" } as unknown,
  events: null as unknown,
  roster: null as unknown,
  races: null as unknown,
  videos: null as unknown,
  videosCalls: [] as (string | null)[],
  actions: null as unknown,
  syncFailed: false,
  clearSyncFailed: undefined as unknown,
}));

vi.mock("../hooks/useRaceDayData", () => ({
  useRaceDayContext: () => h.ctx,
  useRaceEvents: () => h.events,
  useRoster: () => h.roster,
  useRaces: () => h.races,
  useRaceVideos: (_ctx: unknown, eventId: string | null) => {
    h.videosCalls.push(eventId);
    return h.videos;
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
const audit = { schemaVersion: 1 as const, createdAt: prov.createdAt, updatedAt: prov.updatedAt };

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
  rosterIds: ["ann", "bob"],
  ...prov,
  ...over,
});
const athlete = (rosterId: string, displayName: string, bib: string): RaceRosterEntry => ({
  rosterId,
  displayName,
  bib,
  division: "D",
  isSelf: false,
  isFollowed: true,
  athleteRefId: null,
  ...prov,
});
const ann = athlete("ann", "Ann", "1");
const bob = athlete("bob", "Bob", "2");
const video = (over: Partial<RaceVideoRef> = {}): RaceVideoRef => ({
  videoId: "v1",
  raceId: "race-1",
  rosterId: "ann",
  label: "Start",
  externalUrl: null,
  storedWhere: null,
  note: null,
  ...audit,
  ...over,
});

function ready<T>(items: T[], invalid: { id: string; reason: string }[] = []): ListState<T> {
  return { status: "ready", items, invalid, error: null };
}
const saved = { kind: "saved" } as const;

function makeActions() {
  return {
    createVideo: vi.fn().mockResolvedValue(saved),
    updateVideo: vi.fn().mockResolvedValue(saved),
    deleteVideo: vi.fn().mockResolvedValue(saved),
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
      <VideosPage />
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
  h.roster = ready([ann, bob]);
  h.races = ready([race()]);
  h.videos = ready([]);
  h.videosCalls = [];
  h.actions = makeActions();
  h.syncFailed = false;
  h.clearSyncFailed = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

async function choose(user: ReturnType<typeof userEvent.setup>, raceValue: string | null, athleteValue: string | null) {
  if (raceValue) {
    await user.selectOptions(screen.getByLabelText("比赛"), raceValue);
  }
  if (athleteValue) {
    await user.selectOptions(screen.getByLabelText("运动员"), athleteValue);
  }
}

describe("VideosPage PRO gate", () => {
  it("a free user sees the locked card and the page never subscribes to videos", () => {
    pro.isPro = false;
    renderPage();
    expect(screen.getByText("这一页需要 PRO")).toBeTruthy();
    expect(h.videosCalls).toEqual([]);
    expect(screen.queryByLabelText("比赛")).toBeNull();
  });

  it("while the plan loads shows a preparing state and does not subscribe", () => {
    pro.loading = true;
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("正在准备");
    expect(screen.queryByText("这一页需要 PRO")).toBeNull();
    expect(h.videosCalls).toEqual([]);
  });

  it("a plan read error keeps it locked and does not subscribe", () => {
    pro.error = "x";
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("暂时无法确认");
    expect(h.videosCalls).toEqual([]);
  });

  it("a PRO user subscribes to the selected event's videos", () => {
    renderPage();
    expect(h.videosCalls).toContain("buffalo-1");
  });
});

describe("VideosPage states", () => {
  it("shows the heading and a preparing message until the context is ready", () => {
    h.ctx = null;
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("视频");
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

  it("with no races, links to the schedule and offers no form", () => {
    h.races = ready([]);
    renderPage();
    expect(screen.getByText(/还没有赛程/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "赛程" }).getAttribute("href")).toBe("/race-day/schedule");
    expect(screen.queryByLabelText("比赛")).toBeNull();
  });

  it("says plainly that nothing is uploaded, played or analysed", () => {
    renderPage();
    expect(screen.getByText(/不会上传、播放或分析视频文件/)).toBeTruthy();
    expect(document.querySelector('input[type="file"], video')).toBeNull();
  });

  it("shows the empty list text", () => {
    renderPage();
    expect(screen.getByText("还没有视频记录。选择比赛和运动员后添加。")).toBeTruthy();
  });

  it.each([
    ["races", () => (h.races = { status: "error", items: [], invalid: [], error: { code: "unavailable", message: "x" } })],
    ["videos", () => (h.videos = { status: "error", items: [], invalid: [], error: { code: "permission-denied", message: "x" } })],
    ["roster", () => (h.roster = { status: "error", items: [], invalid: [], error: { code: "unavailable", message: "x" } })],
  ])("shows a %s load error and no form", (_name, apply) => {
    apply();
    renderPage();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByLabelText("比赛")).toBeNull();
  });

  it("shows a preparing message while videos load", () => {
    h.videos = { status: "loading", items: [], invalid: [], error: null };
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("正在准备数据");
    expect(screen.queryByLabelText("比赛")).toBeNull();
  });

  it("counts unreadable documents, videos included", () => {
    h.videos = ready([], [{ id: "d", reason: "x" }]);
    h.races = ready([race()], [{ id: "b", reason: "x" }]);
    renderPage();
    expect(screen.getByText("有 2 条数据无法读取，已隐藏。")).toBeTruthy();
  });

  it("shows the sync-failed alert and dismisses it", async () => {
    h.syncFailed = true;
    const user = renderPage();
    expect(screen.getByRole("alert").textContent).toContain("未能同步");
    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(h.clearSyncFailed).toHaveBeenCalled();
  });
});

describe("VideosPage entry", () => {
  it("names the races by schedule number and day in the reader's language, not as an ISO date", () => {
    renderPage();
    const options = Array.from((screen.getByLabelText("比赛") as HTMLSelectElement).options).map((o) => o.text);
    expect(options[0]).toBe("选择比赛");
    expect(options.slice(1).every((text) => /^#\d+ .+ · 10月24日周六$/.test(text))).toBe(true);
  });

  it("offers only the athletes on the chosen race and no form before both are chosen", async () => {
    h.races = ready([race({ rosterIds: ["bob"] })]);
    const user = renderPage();
    expect(screen.queryByLabelText("运动员")).toBeNull();
    await user.selectOptions(screen.getByLabelText("比赛"), "race-1");
    const athletes = Array.from((screen.getByLabelText("运动员") as HTMLSelectElement).options).map((o) => o.text);
    expect(athletes).toEqual(["选择运动员", "Bob"]);
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("says so when the race has no athletes", async () => {
    h.races = ready([race({ rosterIds: [] })]);
    const user = renderPage();
    await choose(user, "race-1", null);
    expect(screen.getByText(/这场比赛还没有运动员/)).toBeTruthy();
  });

  it("creates a record for the chosen race and athlete, then clears the athlete and keeps the race", async () => {
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(screen.getByLabelText(/视频名称/), "Start");
    await user.type(screen.getByLabelText("链接（可选）"), "https://example.com/v");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    await waitFor(() => {
      expect(actions().createVideo).toHaveBeenCalledTimes(1);
    });
    expect(actions().createVideo).toHaveBeenCalledWith("buffalo-1", "race-1", "ann", {
      label: "Start",
      externalUrl: "https://example.com/v",
      storedWhere: null,
      note: null,
    });
    await waitFor(() => {
      expect((screen.getByLabelText("运动员") as HTMLSelectElement).value).toBe("");
    });
    expect((screen.getByLabelText("比赛") as HTMLSelectElement).value).toBe("race-1");
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("a second record for the same race and athlete is another create, not an update", async () => {
    h.videos = ready([video()]);
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(screen.getByLabelText(/视频名称/), "Second angle");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    await waitFor(() => {
      expect(actions().createVideo).toHaveBeenCalledTimes(1);
    });
    expect(actions().updateVideo).not.toHaveBeenCalled();
  });

  it("does not call the repository for an invalid link", async () => {
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(screen.getByLabelText(/视频名称/), "x");
    await user.type(screen.getByLabelText("链接（可选）"), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    expect(actions().createVideo).not.toHaveBeenCalled();
    expect(screen.getByText(/链接需要以 http/)).toBeTruthy();
  });

  it("keeps the form and the input, with a message, when saving fails", async () => {
    actions().createVideo.mockRejectedValue(Object.assign(new Error("denied"), { code: "permission-denied" }));
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(screen.getByLabelText(/视频名称/), "Start");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("权限");
    });
    expect((screen.getByLabelText(/视频名称/) as HTMLInputElement).value).toBe("Start");
  });

  it("tells the user a write is saved on the device when it is only queued", async () => {
    actions().createVideo.mockResolvedValue({ kind: "queued" });
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(screen.getByLabelText(/视频名称/), "Start");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    await waitFor(() => {
      expect(screen.getByText(/已保存在本机/)).toBeTruthy();
    });
  });

  it("logs a failed save without the link or the name", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    actions().createVideo.mockRejectedValue(Object.assign(new Error("https://secret.example.com/x"), { code: "unavailable" }));
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(screen.getByLabelText(/视频名称/), "Private name");
    await user.type(screen.getByLabelText("链接（可选）"), "https://secret.example.com/x");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("secret.example.com");
    expect(logged).not.toContain("Private name");
  });

  it("changing the race clears the athlete", async () => {
    h.races = ready([race(), race({ raceId: "race-2", label: "1000m", sortOrder: 2 })]);
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.selectOptions(screen.getByLabelText("比赛"), "race-2");
    expect((screen.getByLabelText("运动员") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByRole("form")).toBeNull();
  });
});

describe("VideosPage list, edit and delete", () => {
  it("shows records grouped by race, for the current event", () => {
    h.races = ready([race(), race({ raceId: "race-2", label: "1000m", sortOrder: 2 })]);
    h.videos = ready([video(), video({ videoId: "v2", raceId: "race-2", label: "Final" })]);
    renderPage();
    const list = screen.getByRole("heading", { name: "视频记录" }).closest("section") as HTMLElement;
    expect(within(list).getByRole("heading", { name: "#1 500m · 10月24日周六" })).toBeTruthy();
    expect(within(list).getByRole("heading", { name: "#2 1000m · 10月24日周六" })).toBeTruthy();
    expect(within(list).getByText("Final")).toBeTruthy();
  });

  it("edit opens the form with the stored values, shows race and athlete read-only, and focuses it", async () => {
    h.videos = ready([video({ note: "n1", storedWhere: "相册" })]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^编辑/ }));
    const form = screen.getByRole("form", { name: "编辑视频记录" });
    expect((within(form).getByLabelText(/视频名称/) as HTMLInputElement).value).toBe("Start");
    expect((within(form).getByLabelText("备注（可选）") as HTMLInputElement).value).toBe("n1");
    expect(screen.queryByLabelText("比赛")).toBeNull();
    expect(screen.queryByLabelText("运动员")).toBeNull();
    expect(screen.getByText("Ann")).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(within(form).getByLabelText(/视频名称/));
    });
  });

  it("saving an edit updates that record and does not create another", async () => {
    h.videos = ready([video()]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^编辑/ }));
    const name = screen.getByLabelText(/视频名称/);
    await user.clear(name);
    await user.type(name, "Start v2");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    await waitFor(() => {
      expect(actions().updateVideo).toHaveBeenCalledTimes(1);
    });
    expect(actions().updateVideo).toHaveBeenCalledWith("buffalo-1", "v1", {
      label: "Start v2",
      externalUrl: null,
      storedWhere: null,
      note: null,
    });
    expect(actions().createVideo).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("form", { name: "编辑视频记录" })).toBeNull();
    });
  });

  it("cancelling an edit returns to the race and athlete choices without writing", async () => {
    h.videos = ready([video()]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^编辑/ }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(actions().updateVideo).not.toHaveBeenCalled();
    expect(screen.getByLabelText("比赛")).toBeTruthy();
  });

  it("deletes after confirmation", async () => {
    h.videos = ready([video()]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    await user.click(screen.getByRole("button", { name: /^确认删除/ }));
    await waitFor(() => {
      expect(actions().deleteVideo).toHaveBeenCalledWith("buffalo-1", "v1");
    });
  });

  it("deleting the record being edited closes its form", async () => {
    h.videos = ready([video()]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^编辑/ }));
    expect(screen.getByRole("form", { name: "编辑视频记录" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    await user.click(screen.getByRole("button", { name: /^确认删除/ }));
    await waitFor(() => {
      expect(screen.queryByRole("form", { name: "编辑视频记录" })).toBeNull();
    });
  });

  it("shows an error when a row action fails", async () => {
    actions().deleteVideo.mockRejectedValue(Object.assign(new Error("x"), { code: "permission-denied" }));
    h.videos = ready([video()]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    await user.click(screen.getByRole("button", { name: /^确认删除/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("权限");
    });
  });
});

describe("VideosPage in English", () => {
  it("uses English labels", async () => {
    locale.current = "en";
    h.videos = ready([video({ externalUrl: "https://example.com/v" })]);
    const user = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Videos");
    await user.selectOptions(screen.getByLabelText("Race"), "race-1");
    await user.selectOptions(screen.getByLabelText("Athlete"), "ann");
    expect(screen.getByLabelText(/Video name/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open link (example.com)" })).toBeTruthy();
  });

  it("the locked card is in English too", () => {
    locale.current = "en";
    pro.isPro = false;
    renderPage();
    expect(screen.getByText("This page needs PRO")).toBeTruthy();
  });
});
