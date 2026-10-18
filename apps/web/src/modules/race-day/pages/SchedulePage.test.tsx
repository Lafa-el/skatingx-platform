// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceRosterEntry } from "@skatingx/schema";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { legacyColourClasses } from "@/test/legacyLook";
import { render, screen, userEvent, waitFor } from "@/test/dom";

import type { ListState } from "../hooks/useRaceDayData";
import { SchedulePage } from "./SchedulePage";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

const h = vi.hoisted(() => ({
  ctx: { db: {}, userId: "u1" } as unknown,
  events: null as unknown,
  roster: null as unknown,
  races: null as unknown,
  racesCalls: [] as (string | null)[],
  actions: null as unknown,
  syncFailed: false,
  clearSyncFailed: undefined as unknown,
}));

vi.mock("../hooks/useRaceDayData", () => ({
  useRaceDayContext: () => h.ctx,
  useRaceEvents: () => h.events,
  useRoster: () => h.roster,
  useRaces: (_ctx: unknown, eventId: string | null) => {
    h.racesCalls.push(eventId);
    return h.races;
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
};

function event(over: Partial<RaceEvent> = {}): RaceEvent {
  return {
    eventId: "buffalo-1",
    name: "Buffalo Championships",
    dates: ["2026-10-24", "2026-10-25"],
    timeZone: "America/New_York",
    venue: null,
    ...prov,
    ...over,
  };
}

function race(over: Partial<RaceEntry> = {}): RaceEntry {
  return {
    raceId: "r1",
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

function ready<T>(items: T[], invalid: { id: string; reason: string }[] = []): ListState<T> {
  return { status: "ready", items, invalid, error: null };
}

const saved = { kind: "saved" } as const;

function makeActions() {
  return {
    createRace: vi.fn().mockResolvedValue(saved),
    updateRace: vi.fn().mockResolvedValue(saved),
    setRaceVerified: vi.fn().mockResolvedValue(saved),
    deleteRace: vi.fn().mockResolvedValue(saved),
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
      <SchedulePage />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  installMemoryStorage();
  h.ctx = { db: {}, userId: "u1" };
  h.events = ready([event()]);
  h.roster = ready([ann]);
  h.races = ready([race({ day: "2026-10-24", rosterIds: ["ann"] })]);
  h.racesCalls = [];
  h.actions = makeActions();
  h.syncFailed = false;
  h.clearSyncFailed = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("SchedulePage states", () => {
  it("shows the heading and a preparing message until the context is ready", () => {
    h.ctx = null;
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("赛程");
    expect(screen.getByRole("status").textContent).toContain("正在准备");
  });

  it("explains a permission error", () => {
    h.events = { status: "error", items: [], invalid: [], error: { code: "permission-denied", message: "x" } };
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("没有权限");
  });

  it("with no event, points to the Setup page", () => {
    h.events = ready([]);
    renderPage();
    expect(screen.getByText("还没有赛事。请先在设置页创建赛事。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "去设置页" }).getAttribute("href")).toBe("/race-day/setup");
    expect(screen.queryByRole("button", { name: "添加比赛" })).toBeNull();
  });

  it("shows the empty schedule text and an add button", () => {
    h.races = ready([]);
    renderPage();
    expect(screen.getByText(/还没有赛程/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "添加比赛" })).toBeTruthy();
  });

  it("shows a races load error without hiding the event", () => {
    h.races = { status: "error", items: [], invalid: [], error: { code: "unavailable", message: "x" } };
    renderPage();
    expect(screen.getByText("Buffalo Championships")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("请检查网络");
    expect(screen.queryByRole("button", { name: "添加比赛" })).toBeNull();
  });

  it("counts unreadable documents from events, races and roster", () => {
    h.events = ready([event()], [{ id: "a", reason: "x" }]);
    h.races = ready([race()], [{ id: "b", reason: "x" }]);
    h.roster = ready([ann], [{ id: "c", reason: "x" }]);
    renderPage();
    expect(screen.getByText("有 3 条数据无法读取，已隐藏。")).toBeTruthy();
  });

  it("warns, with a link, when the event has no time zone", () => {
    h.events = ready([event({ timeZone: null })]);
    renderPage();
    expect(screen.getByText(/还没有设置时区/)).toBeTruthy();
  });

  it("does not warn when the event has a time zone", () => {
    renderPage();
    expect(screen.queryByText(/还没有设置时区/)).toBeNull();
  });

  it("shows the sync-failed alert and dismisses it", async () => {
    h.syncFailed = true;
    const user = renderPage();
    expect(screen.getByRole("alert").textContent).toContain("未能同步");
    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(h.clearSyncFailed).toHaveBeenCalledTimes(1);
  });
});

describe("SchedulePage races", () => {
  it("shows the event, its pending marker and the race list for that event", () => {
    renderPage();
    expect(screen.getByText("Buffalo Championships")).toBeTruthy();
    expect(screen.getAllByText("待确认").length).toBeGreaterThan(0);
    expect(screen.getByText("Ann")).toBeTruthy();
    expect(h.racesCalls.at(-1)).toBe("buffalo-1");
  });

  it("adds a race to the current event with the next sort order", async () => {
    h.races = ready([race({ sortOrder: 0 }), race({ raceId: "r2", sortOrder: 3 })]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: "添加比赛" }));
    await user.type(screen.getByLabelText(/项目/), "1000m");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(actions().createRace).toHaveBeenCalledTimes(1);
    });
    expect(actions().createRace.mock.calls[0]?.[0]).toBe("buffalo-1");
    expect(actions().createRace.mock.calls[0]?.[1]).toMatchObject({ label: "1000m", sortOrder: 4, scheduledAt: null });
    await waitFor(() => {
      expect(screen.queryByRole("form", { name: "添加比赛" })).toBeNull();
    });
  });

  it("edits a race in place by its id", async () => {
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /编辑 500m #1/ }));
    expect((screen.getByLabelText(/项目/) as HTMLInputElement).value).toBe("500m");
    await user.type(screen.getByLabelText(/轮次/), "Final");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(actions().updateRace).toHaveBeenCalledTimes(1);
    });
    expect(actions().updateRace.mock.calls[0]?.slice(0, 2)).toEqual(["buffalo-1", "r1"]);
    expect(actions().updateRace.mock.calls[0]?.[2]).toMatchObject({ round: "Final" });
  });

  it("verifies and deletes through the list", async () => {
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /标记为已确认 500m #1/ }));
    expect(actions().setRaceVerified).toHaveBeenCalledWith("buffalo-1", "r1", true);
    await user.click(screen.getByRole("button", { name: /^删除 500m #1/ }));
    await user.click(screen.getByRole("button", { name: /确认删除 500m #1/ }));
    expect(actions().deleteRace).toHaveBeenCalledWith("buffalo-1", "r1");
  });

  it("keeps the form open with the user's input and a message when saving fails", async () => {
    actions().createRace.mockRejectedValue(Object.assign(new Error("x"), { code: "unavailable" }));
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: "添加比赛" }));
    await user.type(screen.getByLabelText(/项目/), "Kept");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("请检查网络");
    });
    expect((screen.getByLabelText(/项目/) as HTMLInputElement).value).toBe("Kept");
  });

  it("tells the user a write is saved on the device when it is only queued", async () => {
    actions().createRace.mockResolvedValue({ kind: "queued" });
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: "添加比赛" }));
    await user.type(screen.getByLabelText(/项目/), "500m");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("已保存在本机");
    });
  });

  it("with several events, follows the event chosen on the Setup page", () => {
    h.events = ready([event(), event({ eventId: "other-1", name: "Another Meet" })]);
    window.localStorage.setItem("skatingx.raceDay.activeEventId", "buffalo-1");
    renderPage();
    expect((screen.getByLabelText("当前赛事") as HTMLSelectElement).value).toBe("buffalo-1");
    expect(h.racesCalls.at(-1)).toBe("buffalo-1");
  });
});

describe("SchedulePage look", () => {
  const clean = () => expect(legacyColourClasses(document.body)).toEqual([]);
  const alertsHaveIcons = () => {
    for (const alert of screen.queryAllByRole("alert")) expect(alert.querySelector("svg")).not.toBeNull();
  };
  const fieldErrorsHaveIcons = () => {
    expect(document.querySelectorAll("p[id$='-error']").length).toBeGreaterThan(0);
    for (const error of document.querySelectorAll("p[id$='-error']")) expect(error.querySelector("svg")).not.toBeNull();
  };

  it("the race list, its pending marker and the empty and error states carry no old colour classes", () => {
    renderPage();
    clean();
    document.body.innerHTML = "";
    h.races = ready([]);
    renderPage();
    clean();
  });

  it("the race form with its errors is in the new look", async () => {
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: "添加比赛" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    fieldErrorsHaveIcons();
    clean();
  });

  it("the delete confirmation is an alert with an icon and a danger-outline confirm button", async () => {
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^删除 500m/ }));
    expect(screen.getByRole("alert").querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: /确认删除/ }).className).toContain("text-status-danger");
    clean();
  });

  it("a load error has an icon", () => {
    h.races = { status: "error", items: [], invalid: [], error: { code: "unavailable", message: "x" } };
    renderPage();
    alertsHaveIcons();
    clean();
  });
});
