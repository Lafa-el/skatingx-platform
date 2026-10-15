// @vitest-environment happy-dom
import type { RaceEvent, RaceRosterEntry } from "@skatingx/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import type { ListState } from "../hooks/useRaceDayData";
import { SetupPage } from "./SetupPage";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useActiveAthlete: () => ({ athleteId: "lindsay" }),
}));

const h = vi.hoisted(() => {
  return {
    ctx: { db: {}, userId: "u1" } as unknown,
    events: null as unknown,
    roster: null as unknown,
    rosterCalls: [] as (string | null)[],
    actions: null as unknown,
    syncFailed: false,
    clearSyncFailed: undefined as unknown,
  };
});

vi.mock("../hooks/useRaceDayData", () => ({
  useRaceDayContext: () => h.ctx,
  useRaceEvents: () => h.events,
  useRoster: (_ctx: unknown, eventId: string | null) => {
    h.rosterCalls.push(eventId);
    return h.roster;
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
    eventId: "buffalo-abc123",
    name: "Buffalo Championships",
    dates: ["2026-10-24", "2026-10-25"],
    timeZone: null,
    venue: null,
    ...prov,
    ...over,
  };
}

function rosterEntry(over: Partial<RaceRosterEntry> = {}): RaceRosterEntry {
  return {
    rosterId: "lindsay-1",
    displayName: "Lindsay",
    bib: "134",
    division: "Division 6 Wings",
    isSelf: true,
    isFollowed: false,
    athleteRefId: "lindsay",
    ...prov,
    ...over,
  };
}

function ready<T>(items: T[], invalid: { id: string; reason: string }[] = []): ListState<T> {
  return { status: "ready", items, invalid, error: null };
}

const saved = { kind: "saved" } as const;

function makeActions() {
  return {
    createEvent: vi.fn().mockResolvedValue({ eventId: "new-event-1", outcome: saved }),
    updateEvent: vi.fn().mockResolvedValue(saved),
    setEventVerified: vi.fn().mockResolvedValue(saved),
    deleteEvent: vi.fn().mockResolvedValue(saved),
    createRoster: vi.fn().mockResolvedValue(saved),
    updateRoster: vi.fn().mockResolvedValue(saved),
    setRosterVerified: vi.fn().mockResolvedValue(saved),
    deleteRoster: vi.fn().mockResolvedValue(saved),
    applyTemplate: vi.fn().mockResolvedValue({ eventId: "buffalo-championships-2026", outcome: saved }),
  };
}

// The test environment's own localStorage differs between Node versions (Node 25+ ships a
// global one that happy-dom does not replace), so use an in-memory stand-in for a stable test.
function installMemoryStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  };
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
}

beforeEach(() => {
  installMemoryStorage();
  h.ctx = { db: {}, userId: "u1" };
  h.events = ready([event()]);
  h.roster = ready([rosterEntry()]);
  h.rosterCalls = [];
  h.actions = makeActions();
  h.syncFailed = false;
  h.clearSyncFailed = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const actions = () => h.actions as ReturnType<typeof makeActions>;

describe("SetupPage states", () => {
  it("shows the heading and a preparing message until the user context is ready", () => {
    h.ctx = null;
    render(<SetupPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("设置");
    expect(screen.getByRole("status").textContent).toContain("正在准备");
  });

  it("shows a preparing message while events load", () => {
    h.events = { status: "loading", items: [], invalid: [], error: null };
    render(<SetupPage />);
    expect(screen.getByRole("status").textContent).toContain("正在准备");
  });

  it("explains a permission error without showing the raw error", () => {
    h.events = {
      status: "error",
      items: [],
      invalid: [],
      error: { code: "permission-denied", message: "users/u1/raceDay denied" },
    };
    render(<SetupPage />);
    expect(screen.getByRole("alert").textContent).toContain("没有权限");
    expect(screen.queryByText(/users\/u1/)).toBeNull();
  });

  it("explains other load errors as a connection problem", () => {
    h.events = {
      status: "error",
      items: [],
      invalid: [],
      error: { code: "unavailable", message: "x" },
    };
    render(<SetupPage />);
    expect(screen.getByRole("alert").textContent).toContain("请检查网络");
  });

  it("tells the user how many unreadable documents were hidden", () => {
    h.events = ready([event()], [{ id: "bad", reason: "schema" }]);
    h.roster = ready([rosterEntry()], [{ id: "bad2", reason: "schema" }]);
    render(<SetupPage />);
    expect(screen.getByText("有 2 条数据无法读取,已隐藏。")).toBeTruthy();
  });

  it("shows the sync-failed alert and lets the user dismiss it", async () => {
    h.syncFailed = true;
    const user = userEvent.setup();
    render(<SetupPage />);
    expect(screen.getByRole("alert").textContent).toContain("未能同步");
    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(h.clearSyncFailed).toHaveBeenCalledTimes(1);
  });
});

describe("SetupPage event", () => {
  it("with no events, shows the empty text and the create form without cancel, and no roster", () => {
    h.events = ready([]);
    h.roster = ready([]);
    render(<SetupPage />);
    expect(screen.getByText(/还没有赛事/)).toBeTruthy();
    expect(screen.getByRole("form", { name: "创建赛事" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "取消" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "运动员名单" })).toBeNull();
    expect(h.rosterCalls.every((id) => id === null)).toBe(true);
  });

  it("creating an event calls the action with the typed name and selects the new event", async () => {
    h.events = ready([]);
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.type(screen.getByLabelText(/赛事名称/), "Buffalo Championships");
    const date = screen.getByLabelText(/第 1 天/) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(date, "2026-10-24");
    date.dispatchEvent(new Event("input", { bubbles: true }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(actions().createEvent).toHaveBeenCalledTimes(1);
    });
    expect(actions().createEvent.mock.calls[0]?.[0]).toMatchObject({
      name: "Buffalo Championships",
      dates: ["2026-10-24"],
    });
    expect(window.localStorage.getItem("skatingx.raceDay.activeEventId")).toBe("new-event-1");
  });

  it("shows the event with its pending marker and dates", () => {
    render(<SetupPage />);
    expect(screen.getByText("Buffalo Championships")).toBeTruthy();
    expect(screen.getByText("比赛日期:2026-10-24, 2026-10-25")).toBeTruthy();
    expect(screen.getAllByText("待确认").length).toBeGreaterThan(0);
  });

  it("toggles event verification to verified, then back", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: "标记为已确认" }));
    // Event card button is the first "mark verified"; roster has its own with a name suffix.
    expect(actions().setEventVerified).toHaveBeenCalledWith("buffalo-abc123", true);
    unmount();

    h.events = ready([event({ verification: "verified" })]);
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: "退回待确认" }));
    expect(actions().setEventVerified).toHaveBeenLastCalledWith("buffalo-abc123", false);
  });

  it("deleting an event warns about the cascade and needs confirmation", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    const deleteButtons = screen.getAllByRole("button", { name: /^删除/ });
    await user.click(deleteButtons[0]!);
    expect(screen.getByRole("alert").textContent).toContain("名单、赛程和所有成绩");
    expect(screen.getByRole("alert").textContent).toContain("视频记录");
    expect(screen.getByRole("alert").textContent).toContain("视频文件本身不受影响");
    expect(screen.getByRole("alert").textContent).toContain("无法恢复");
    expect(actions().deleteEvent).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(actions().deleteEvent).toHaveBeenCalledExactlyOnceWith("buffalo-abc123");
  });

  it("edits the event through a prefilled form", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getAllByRole("button", { name: /^编辑/ })[0]!);
    expect((screen.getByLabelText(/赛事名称/) as HTMLInputElement).value).toBe("Buffalo Championships");
    await user.clear(screen.getByLabelText(/赛事名称/));
    await user.type(screen.getByLabelText(/赛事名称/), "Buffalo 2026");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(actions().updateEvent).toHaveBeenCalledTimes(1);
    });
    expect(actions().updateEvent.mock.calls[0]?.[0]).toBe("buffalo-abc123");
    expect(actions().updateEvent.mock.calls[0]?.[1]).toMatchObject({ name: "Buffalo 2026" });
  });

  it("with several events, a selector switches the roster to the chosen event", async () => {
    h.events = ready([event(), event({ eventId: "other-1", name: "Another Meet" })]);
    const user = userEvent.setup();
    render(<SetupPage />);
    const select = screen.getByLabelText("当前赛事");
    // Sorted by name, so "Another Meet" is first and selected by default.
    expect((select as HTMLSelectElement).value).toBe("other-1");
    await user.selectOptions(select, "buffalo-abc123");
    expect(h.rosterCalls.at(-1)).toBe("buffalo-abc123");
    expect(window.localStorage.getItem("skatingx.raceDay.activeEventId")).toBe("buffalo-abc123");
  });

  it("remembers the chosen event across visits and ignores an id that no longer exists", () => {
    h.events = ready([event(), event({ eventId: "other-1", name: "Another Meet" })]);
    window.localStorage.setItem("skatingx.raceDay.activeEventId", "buffalo-abc123");
    const { unmount } = render(<SetupPage />);
    expect((screen.getByLabelText("当前赛事") as HTMLSelectElement).value).toBe("buffalo-abc123");
    unmount();

    window.localStorage.setItem("skatingx.raceDay.activeEventId", "deleted-event");
    render(<SetupPage />);
    expect((screen.getByLabelText("当前赛事") as HTMLSelectElement).value).toBe("other-1");
  });
});

describe("SetupPage roster", () => {
  it("shows the roster list with the pending marker for each athlete", () => {
    render(<SetupPage />);
    expect(screen.getByRole("heading", { name: "运动员名单" })).toBeTruthy();
    expect(screen.getByText(/号码 134/)).toBeTruthy();
  });

  it("shows the empty roster text", () => {
    h.roster = ready([]);
    render(<SetupPage />);
    expect(screen.getByText(/名单还是空的/)).toBeTruthy();
  });

  it("shows a roster load error without hiding the event", () => {
    h.roster = {
      status: "error",
      items: [],
      invalid: [],
      error: { code: "permission-denied", message: "x" },
    };
    render(<SetupPage />);
    expect(screen.getByText("Buffalo Championships")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("没有权限");
  });

  it("adds an athlete to the current event and closes the form", async () => {
    h.roster = ready([]);
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: "添加运动员" }));
    await user.type(screen.getByLabelText(/姓名/), "Lindsay");
    await user.type(screen.getByLabelText(/号码/), "134");
    await user.type(screen.getByLabelText(/组别/), "Division 6 Wings");
    await user.click(screen.getByLabelText("这是我自己的运动员"));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(actions().createRoster).toHaveBeenCalledTimes(1);
    });
    expect(actions().createRoster.mock.calls[0]?.[0]).toBe("buffalo-abc123");
    expect(actions().createRoster.mock.calls[0]?.[1]).toMatchObject({
      displayName: "Lindsay",
      bib: "134",
      isSelf: true,
      athleteRefId: "lindsay",
    });
    await waitFor(() => {
      expect(screen.queryByRole("form", { name: "添加运动员" })).toBeNull();
    });
  });

  it("edits an athlete in place and updates that roster id", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: /编辑 Lindsay/ }));
    expect((screen.getByLabelText(/号码/) as HTMLInputElement).value).toBe("134");
    await user.clear(screen.getByLabelText(/号码/));
    await user.type(screen.getByLabelText(/号码/), "135");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(actions().updateRoster).toHaveBeenCalledTimes(1);
    });
    expect(actions().updateRoster.mock.calls[0]?.slice(0, 2)).toEqual(["buffalo-abc123", "lindsay-1"]);
    expect(actions().updateRoster.mock.calls[0]?.[2]).toMatchObject({ bib: "135" });
  });

  it("verifies and deletes through the list actions", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: /标记为已确认 Lindsay/ }));
    expect(actions().setRosterVerified).toHaveBeenCalledWith("buffalo-abc123", "lindsay-1", true);
    await user.click(screen.getByRole("button", { name: /^删除 Lindsay/ }));
    await user.click(screen.getByRole("button", { name: /确认删除 Lindsay/ }));
    expect(actions().deleteRoster).toHaveBeenCalledWith("buffalo-abc123", "lindsay-1");
  });

  it("keeps the form open with the user's input and a message when saving fails", async () => {
    h.roster = ready([]);
    actions().createRoster.mockRejectedValue(Object.assign(new Error("x"), { code: "unavailable" }));
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: "添加运动员" }));
    await user.type(screen.getByLabelText(/姓名/), "Kept Name");
    await user.type(screen.getByLabelText(/号码/), "1");
    await user.type(screen.getByLabelText(/组别/), "D");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("请检查网络");
    });
    expect((screen.getByLabelText(/姓名/) as HTMLInputElement).value).toBe("Kept Name");
  });

  it("tells the user a write is saved on the device when it is only queued", async () => {
    h.roster = ready([]);
    actions().createRoster.mockResolvedValue({ kind: "queued" });
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: "添加运动员" }));
    await user.type(screen.getByLabelText(/姓名/), "A");
    await user.type(screen.getByLabelText(/号码/), "1");
    await user.type(screen.getByLabelText(/组别/), "D");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("已保存在本机");
    });
  });
});

describe("SetupPage when device storage is unavailable", () => {
  it("still works and falls back to the first event instead of crashing", async () => {
    const broken = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    Object.defineProperty(window, "localStorage", { value: broken, configurable: true });
    h.events = ready([event(), event({ eventId: "other-1", name: "Another Meet" })]);
    const user = userEvent.setup();
    render(<SetupPage />);
    const select = screen.getByLabelText("当前赛事") as HTMLSelectElement;
    expect(select.value).toBe("other-1");
    await user.selectOptions(select, "buffalo-abc123");
    expect(select.value).toBe("buffalo-abc123");
  });
});

describe("SetupPage template", () => {
  it("offers the Buffalo template when there is no event yet", () => {
    h.events = ready([]);
    render(<SetupPage />);
    expect(screen.getByRole("button", { name: /用模板创建赛事/ })).toBeTruthy();
  });

  it("applies the template, selects its event and closes the create panel", async () => {
    h.events = ready([]);
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: /用模板创建赛事/ }));
    await waitFor(() => {
      expect(actions().applyTemplate).toHaveBeenCalledTimes(1);
    });
    expect(actions().applyTemplate.mock.calls[0]?.[0]).toMatchObject({ eventId: "buffalo-championships-2026" });
    expect(window.localStorage.getItem("skatingx.raceDay.activeEventId")).toBe("buffalo-championships-2026");
  });

  it("shows a message and keeps the page usable when applying fails", async () => {
    h.events = ready([]);
    actions().applyTemplate.mockRejectedValue(Object.assign(new Error("x"), { code: "unavailable" }));
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: /用模板创建赛事/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("请检查网络");
    });
    expect(screen.getByRole("button", { name: /用模板创建赛事/ })).toBeTruthy();
  });

  it("does not offer the template again once its event exists", async () => {
    h.events = ready([event({ eventId: "buffalo-championships-2026" })]);
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getAllByRole("button", { name: "创建赛事" })[0]!);
    expect(screen.queryByRole("button", { name: /用模板创建赛事/ })).toBeNull();
    expect(screen.getByText("已经使用过这个模板。")).toBeTruthy();
  });

  it("is hidden while editing an event", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getAllByRole("button", { name: /^编辑/ })[0]!);
    expect(screen.queryByText("使用模板")).toBeNull();
  });
});
