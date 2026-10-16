// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor, within } from "@/test/dom";

import type { ListState } from "../hooks/useRaceDayData";
import { ResultsPage } from "./ResultsPage";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const h = vi.hoisted(() => ({
  ctx: { db: {}, userId: "u1" } as unknown,
  events: null as unknown,
  roster: null as unknown,
  races: null as unknown,
  results: null as unknown,
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

function ready<T>(items: T[], invalid: { id: string; reason: string }[] = []): ListState<T> {
  return { status: "ready", items, invalid, error: null };
}

const saved = { kind: "saved" } as const;

function makeActions() {
  return {
    createResult: vi.fn().mockResolvedValue(saved),
    updateResult: vi.fn().mockResolvedValue(saved),
    setResultVerified: vi.fn().mockResolvedValue(saved),
    deleteResult: vi.fn().mockResolvedValue(saved),
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
      <ResultsPage />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  installMemoryStorage();
  locale.current = "zh";
  h.ctx = { db: {}, userId: "u1" };
  h.events = ready([buffalo]);
  h.roster = ready([ann, bob]);
  h.races = ready([race()]);
  h.results = ready([]);
  h.resultsCalls = [];
  h.actions = makeActions();
  h.syncFailed = false;
  h.clearSyncFailed = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

// getByRole("textbox"): the feed section is also labelled "成绩动态", so a label match alone is ambiguous.
const timeBox = () => screen.getByRole("textbox", { name: /^成绩/ });

async function choose(user: ReturnType<typeof userEvent.setup>, raceLabel: string | null, athlete: string | null) {
  if (raceLabel) {
    await user.selectOptions(screen.getByLabelText("比赛"), raceLabel);
  }
  if (athlete) {
    await user.selectOptions(screen.getByLabelText("运动员"), athlete);
  }
}

describe("ResultsPage states", () => {
  it("shows the heading and a preparing message until the context is ready", () => {
    h.ctx = null;
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("成绩");
    expect(screen.getByRole("status").textContent).toContain("正在准备数据");
  });

  it("shows a preparing message while events load", () => {
    h.events = { status: "loading", items: [], invalid: [], error: null };
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("正在准备数据");
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
  });

  it("with no races, says results cannot be entered and links to the schedule", () => {
    h.races = ready([]);
    renderPage();
    expect(screen.getByText(/不能录入成绩/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "赛程" }).getAttribute("href")).toBe("/race-day/schedule");
    expect(screen.queryByLabelText("比赛")).toBeNull();
  });

  it("shows the empty feed text", () => {
    renderPage();
    expect(screen.getByText("还没有成绩。选择比赛和运动员后录入。")).toBeTruthy();
  });

  it.each([
    ["races", () => (h.races = { status: "error", items: [], invalid: [], error: { code: "unavailable", message: "x" } })],
    ["results", () => (h.results = { status: "error", items: [], invalid: [], error: { code: "permission-denied", message: "x" } })],
    ["roster", () => (h.roster = { status: "error", items: [], invalid: [], error: { code: "unavailable", message: "x" } })],
  ])("shows a %s load error and no entry form", (_name, apply) => {
    apply();
    renderPage();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByLabelText("比赛")).toBeNull();
  });

  it("does not offer entry before the results have loaded (create vs update depends on them)", () => {
    h.results = { status: "loading", items: [], invalid: [], error: null };
    renderPage();
    expect(screen.queryByLabelText("比赛")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("正在准备数据");
  });

  it("counts unreadable documents from every list", () => {
    h.events = ready([buffalo], [{ id: "a", reason: "x" }]);
    h.races = ready([race()], [{ id: "b", reason: "x" }]);
    h.roster = ready([ann], [{ id: "c", reason: "x" }]);
    h.results = ready([], [{ id: "d", reason: "x" }]);
    renderPage();
    expect(screen.getByText("有 4 条数据无法读取,已隐藏。")).toBeTruthy();
  });

  it("shows the sync-failed alert and dismisses it", async () => {
    h.syncFailed = true;
    const user = renderPage();
    expect(screen.getByRole("alert").textContent).toContain("未能同步");
    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(h.clearSyncFailed).toHaveBeenCalled();
  });

  it("subscribes to results of the selected event", () => {
    renderPage();
    expect(h.resultsCalls).toContain("buffalo-1");
  });
});

describe("ResultsPage entry", () => {
  it("lists the races by schedule number and only the athletes assigned to the chosen race", async () => {
    h.races = ready([race({ raceId: "race-2", label: "1000m", sortOrder: 2, rosterIds: ["bob"] }), race()]);
    const user = renderPage();
    const raceOptions = Array.from((screen.getByLabelText("比赛") as HTMLSelectElement).options).map((o) => o.text);
    expect(raceOptions).toEqual(["选择比赛", "#1 500m · 10月24日周六", "#2 1000m · 10月24日周六"]);

    await user.selectOptions(screen.getByLabelText("比赛"), "race-2");
    const athletes = Array.from((screen.getByLabelText("运动员") as HTMLSelectElement).options).map((o) => o.text);
    expect(athletes).toEqual(["选择运动员", "Bob"]);
  });

  it("shows no athlete choice or form until a race is chosen, and no form until an athlete is chosen", async () => {
    const user = renderPage();
    expect(screen.queryByLabelText("运动员")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    await choose(user, "race-1", null);
    expect(screen.getByLabelText("运动员")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    await choose(user, null, "ann");
    expect(screen.getByRole("form", { name: "录入成绩" })).toBeTruthy();
  });

  it("says so when the race has no athletes assigned", async () => {
    h.races = ready([race({ rosterIds: [] })]);
    const user = renderPage();
    await choose(user, "race-1", null);
    expect(screen.getByText(/还没有指派运动员/)).toBeTruthy();
    expect(screen.queryByLabelText("运动员")).toBeNull();
  });

  it("creates a new result for the chosen race and athlete, then keeps the race for the next athlete", async () => {
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(timeBox(), "0:49.123");
    await user.type(screen.getByLabelText("名次(可选)"), "2");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));

    await waitFor(() => {
      expect(actions().createResult).toHaveBeenCalledWith("buffalo-1", "race-1", "ann", {
        status: "finished",
        time: "0:49.123",
        place: "2",
        advanced: null,
        sourceNote: "",
      });
    });
    expect(actions().updateResult).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("form")).toBeNull();
    });
    expect((screen.getByLabelText("比赛") as HTMLSelectElement).value).toBe("race-1");
    expect((screen.getByLabelText("运动员") as HTMLSelectElement).value).toBe("");
  });

  it("records a DNS without a time", async () => {
    const user = renderPage();
    await choose(user, "race-1", "bob");
    await user.selectOptions(screen.getByLabelText("状态"), "DNS");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    await waitFor(() => {
      expect(actions().createResult).toHaveBeenCalledWith("buffalo-1", "race-1", "bob", {
        status: "DNS",
        time: "",
        place: "",
        advanced: null,
        sourceNote: "",
      });
    });
  });

  it("re-saving the same race and athlete updates the existing result instead of creating a second one", async () => {
    h.results = ready([result("ann", { timeSeconds: 104.231, place: 3, advanced: false })]);
    const user = renderPage();
    await choose(user, "race-1", "ann");

    expect(screen.getByRole("form", { name: "编辑成绩" })).toBeTruthy();
    expect(screen.getByText(/已有成绩.*待确认/)).toBeTruthy();
    const time = timeBox() as HTMLInputElement;
    expect(time.value).toBe("1:44.231");

    await user.clear(time);
    await user.type(time, "1:43.9");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));

    await waitFor(() => {
      expect(actions().updateResult).toHaveBeenCalledWith("buffalo-1", "race-1_ann", {
        status: "finished",
        time: "1:43.9",
        place: "3",
        advanced: false,
        sourceNote: "",
      });
    });
    expect(actions().createResult).not.toHaveBeenCalled();
  });

  it("a different athlete in the same race creates their own result", async () => {
    h.results = ready([result("ann")]);
    const user = renderPage();
    await choose(user, "race-1", "bob");
    expect(screen.getByRole("form", { name: "录入成绩" })).toBeTruthy();
    await user.type(timeBox(), "51");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    await waitFor(() => {
      expect(actions().createResult).toHaveBeenCalledWith("buffalo-1", "race-1", "bob", expect.anything());
    });
  });

  it("switching to another athlete starts from that athlete's own values, not the previous form", async () => {
    h.results = ready([result("ann", { timeSeconds: 49.8 })]);
    const user = renderPage();
    await choose(user, "race-1", "ann");
    expect((timeBox() as HTMLInputElement).value).toBe("49.80");
    await user.type(screen.getByLabelText("来源说明(可选)"), "typed for Ann");

    await user.selectOptions(screen.getByLabelText("运动员"), "bob");
    expect(screen.getByRole("form", { name: "录入成绩" })).toBeTruthy();
    expect((timeBox() as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("来源说明(可选)") as HTMLInputElement).value).toBe("");
  });

  it("changing the race clears the athlete, because the athlete belongs to the race", async () => {
    h.races = ready([race(), race({ raceId: "race-2", label: "1000m", sortOrder: 2 })]);
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.selectOptions(screen.getByLabelText("比赛"), "race-2");
    expect((screen.getByLabelText("运动员") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("keeps the form open with the user's input and a message when saving fails", async () => {
    actions().createResult.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "unavailable" }));
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(timeBox(), "49.8");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));

    await waitFor(() => {
      expect(screen.getByText(/未能保存/)).toBeTruthy();
    });
    expect((timeBox() as HTMLInputElement).value).toBe("49.8");
    expect(screen.getByRole("form")).toBeTruthy();
  });

  it("tells the user a write is saved on the device when it is only queued", async () => {
    actions().createResult.mockResolvedValueOnce({ kind: "queued" });
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(timeBox(), "49.8");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    await waitFor(() => {
      expect(screen.getByText(/已保存在本机/)).toBeTruthy();
    });
  });

  it("does not call the repository for an invalid time", async () => {
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.type(timeBox(), "1:75.00");
    await user.click(screen.getByRole("button", { name: "保存成绩" }));
    expect(actions().createResult).not.toHaveBeenCalled();
    expect(screen.getByText(/成绩格式不对/)).toBeTruthy();
  });

  it("cancel closes the form and keeps the race", async () => {
    const user = renderPage();
    await choose(user, "race-1", "ann");
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect((screen.getByLabelText("比赛") as HTMLSelectElement).value).toBe("race-1");
  });
});

describe("ResultsPage feed", () => {
  it("shows results newest first, each with its pending marker, for the current event only", () => {
    h.results = ready([
      result("ann", { updatedAt: "2026-10-24T12:00:00.000Z" }),
      result("bob", { updatedAt: "2026-10-24T13:00:00.000Z", timeSeconds: 51.123 }),
    ]);
    renderPage();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("span")?.textContent)).toEqual(["Bob", "Ann"]);
    for (const li of items) {
      expect(within(li).getByText("待确认")).toBeTruthy();
    }
    expect(screen.getByText("51.123")).toBeTruthy();
    expect(screen.queryByText("还没有成绩。选择比赛和运动员后录入。")).toBeNull();
  });

  it("verifies and deletes through the list", async () => {
    h.results = ready([result("ann")]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^标记为已确认/ }));
    await waitFor(() => {
      expect(actions().setResultVerified).toHaveBeenCalledWith("buffalo-1", "race-1_ann", true);
    });
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    await user.click(screen.getByRole("button", { name: /^确认删除/ }));
    await waitFor(() => {
      expect(actions().deleteResult).toHaveBeenCalledWith("buffalo-1", "race-1_ann");
    });
  });

  it("returns a verified result to pending through the list", async () => {
    h.results = ready([result("ann", { verification: "verified", verifiedAt: "2026-10-24T11:00:00.000Z" })]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^退回待确认/ }));
    await waitFor(() => {
      expect(actions().setResultVerified).toHaveBeenCalledWith("buffalo-1", "race-1_ann", false);
    });
  });

  it("shows an error when a row action fails", async () => {
    actions().deleteResult.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "permission-denied" }));
    h.results = ready([result("ann")]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    await user.click(screen.getByRole("button", { name: /^确认删除/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("没有权限");
    });
  });

  it("Edit selects that race and athlete, opens the form with the stored values and focuses it", async () => {
    h.results = ready([result("ann", { timeSeconds: 49.123, place: 2, advanced: true })]);
    const user = renderPage();
    await user.click(screen.getByRole("button", { name: /^编辑/ }));

    expect((screen.getByLabelText("比赛") as HTMLSelectElement).value).toBe("race-1");
    expect((screen.getByLabelText("运动员") as HTMLSelectElement).value).toBe("ann");
    expect(screen.getByRole("form", { name: "编辑成绩" })).toBeTruthy();
    expect((timeBox() as HTMLInputElement).value).toBe("49.123");
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("状态"));
    });
  });

  it("can still edit a result whose athlete was taken off the race, and keeps that athlete selectable", async () => {
    h.races = ready([race({ rosterIds: ["ann"] })]);
    h.results = ready([result("bob")]);
    const user = renderPage();
    expect(screen.getByText("该运动员已不在这场比赛名单中")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^编辑/ }));
    const athletes = Array.from((screen.getByLabelText("运动员") as HTMLSelectElement).options).map((o) => o.text);
    expect(athletes).toEqual(["选择运动员", "Ann", "Bob"]);
    expect((screen.getByLabelText("运动员") as HTMLSelectElement).value).toBe("bob");
    expect(screen.getByRole("form", { name: "编辑成绩" })).toBeTruthy();
  });
});

describe("ResultsPage in English", () => {
  it("uses English labels and the English format hint", async () => {
    locale.current = "en";
    h.results = ready([result("ann", { place: 1 })]);
    const user = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Results");
    expect(screen.getByText("Results feed")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Race"), "race-1");
    await user.selectOptions(screen.getByLabelText("Athlete"), "bob");
    expect(screen.getByText(/Up to three decimals/)).toBeTruthy();
    expect(screen.getByText("Place 1")).toBeTruthy();
  });
});
