// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { planRaceRecords, reconcileRaceEntries } from "@skatingx/skating-domain";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, render, screen, userEvent, within } from "@/test/dom";

import { RaceRecordSyncContext } from "../hooks/raceRecordSyncState";
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
  actions: null as unknown,
  subscribed: 0,
  unsubscribed: 0,
  onData: null as null | ((entries: ReadonlyArray<Record<string, unknown>>) => void),
  onError: null as null | ((error: { code: string }) => void),
}));

vi.mock("../hooks/useRaceDayData", () => ({
  useRaceDayContext: () => h.ctx,
  useRaceEvents: () => h.events,
  useRoster: () => h.roster,
  useRaces: () => h.races,
  useRaceResults: () => h.results,
}));
vi.mock("../hooks/useRaceDayActions", () => ({
  useRaceDayActions: () => ({ actions: h.actions, syncFailed: false, clearSyncFailed: vi.fn() }),
}));
vi.mock("@/app/providers/FirestoreProvider", () => ({ useActiveAthlete: () => ({ athleteId: "ath-1" }) }));

// The real status derivation and the real reconcile run; only the Firestore listener is replaced.
vi.mock("@skatingx/firebase-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@skatingx/firebase-client")>()),
  subscribeToRaceRecordEntries: (
    _ctx: unknown,
    onData: (entries: ReadonlyArray<Record<string, unknown>>) => void,
    onError: (error: { code: string }) => void,
  ) => {
    h.subscribed += 1;
    h.onData = onData;
    h.onError = onError;
    return () => {
      h.unsubscribed += 1;
    };
  },
}));

const confirmed = {
  verification: "verified" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: "2026-10-24T11:00:00.000Z",
  schemaVersion: 1 as const,
  createdAt: "2026-10-24T10:00:00.000Z",
  updatedAt: "2026-10-24T10:00:00.000Z",
};
const pending = { ...confirmed, verification: "pending" as const, verifiedAt: null };

const buffalo: RaceEvent = {
  eventId: "buffalo-1",
  name: "Buffalo Championships",
  dates: ["2026-10-24", "2026-10-25"],
  timeZone: "America/New_York",
  venue: null,
  ...confirmed,
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
  rosterIds: ["lindsay", "ann"],
  ...confirmed,
  ...over,
});

const person = (rosterId: string, over: Partial<RaceRosterEntry> = {}): RaceRosterEntry => ({
  rosterId,
  displayName: rosterId === "lindsay" ? "Lindsay" : "Ann",
  bib: "1",
  division: "D",
  isSelf: false,
  isFollowed: true,
  athleteRefId: null,
  ...confirmed,
  ...over,
});
const me = person("lindsay", { isSelf: true, athleteRefId: "ath-1" });
const ann = person("ann");

const result = (rosterId: string, over: Partial<RaceResult> = {}): RaceResult => ({
  resultId: `race-1_${rosterId}`,
  raceId: "race-1",
  rosterId,
  status: "finished",
  timeSeconds: 49.8,
  place: null,
  advanced: null,
  ...confirmed,
  ...over,
});

function ready<T>(items: T[]): ListState<T> {
  return { status: "ready", items, invalid: [], error: null };
}

function setup(over: {
  races?: RaceEntry[];
  roster?: RaceRosterEntry[];
  results?: RaceResult[];
}) {
  h.races = ready(over.races ?? [race()]);
  h.roster = ready(over.roster ?? [me, ann]);
  h.results = ready(over.results ?? [result("lindsay")]);
}

function renderPage(sync = { failed: false, retry: () => undefined }) {
  const view = render(
    <MemoryRouter>
      <RaceRecordSyncContext.Provider value={sync}>
        <ResultsPage />
      </RaceRecordSyncContext.Provider>
    </MemoryRouter>,
  );
  return { ...view, user: userEvent.setup() };
}

/** The entries the real reconcile would write for what is on screen. */
function reconciledEntries(): ReadonlyArray<Record<string, unknown>> {
  const plan = planRaceRecords({
    sources: {
      events: [
        {
          event: buffalo,
          roster: (h.roster as ListState<RaceRosterEntry>).items,
          races: (h.races as ListState<RaceEntry>).items,
          results: (h.results as ListState<RaceResult>).items,
          complete: true,
        },
      ],
      eventsComplete: true,
      unknownEventIds: [],
    } as never,
    athleteId: "ath-1",
  });
  const { entries } = reconcileRaceEntries({
    existing: [],
    desired: plan.desired,
    canRemoveEntriesOf: plan.canRemoveEntriesOf,
    nowIso: "2026-10-30T12:00:00.000Z",
  });
  // As the reader hands them over: each entry marked with the document (distance) it sits in.
  return (entries as ReadonlyArray<Record<string, unknown>>).map((entry) => ({
    ...entry,
    recordDistanceId: plan.desired.find((desired) => desired.entryId === entry.id)?.recordDistanceId,
  }));
}

const lines = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-sync]")].map((node) => node.textContent?.trim());

beforeEach(() => {
  locale.current = "zh";
  h.ctx = { db: {}, userId: "u1" };
  h.events = ready([buffalo]);
  h.actions = {
    createResult: vi.fn(),
    updateResult: vi.fn(),
    setResultVerified: vi.fn(),
    deleteResult: vi.fn(),
  };
  h.subscribed = 0;
  h.unsubscribed = 0;
  h.onData = null;
  h.onError = null;
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
    configurable: true,
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("result row sync status: lists that came from the local cache", () => {
  const cached = <T,>(items: T[]): ListState<T> => ({ ...ready(items), fromCache: true });

  it("a cached input list makes the row unknown, not recorded or waiting", () => {
    setup({});
    h.results = cached((h.results as ListState<RaceResult>).items);
    const { container } = renderPage();
    act(() => h.onData?.(reconciledEntries()));
    expect(lines(container)).toEqual(["纪录读取失败，同步状态未知"]);
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual(["纪录读取失败，同步状态未知"]);
  });

  it("each of the event, race and roster lists does the same", () => {
    for (const key of ["events", "races", "roster"] as const) {
      setup({});
      if (key === "events") h.events = cached([buffalo]);
      if (key === "races") h.races = cached([race()]);
      if (key === "roster") h.roster = cached([me, ann]);
      const view = renderPage();
      act(() => h.onData?.(reconciledEntries()));
      expect(lines(view.container)).toEqual(["纪录读取失败，同步状态未知"]);
      view.unmount();
      h.events = ready([buffalo]);
    }
  });

  it("a server snapshot behaves as before: recorded, then waiting (guard)", () => {
    setup({});
    h.results = { ...ready((h.results as ListState<RaceResult>).items), fromCache: false };
    const { container } = renderPage();
    act(() => h.onData?.(reconciledEntries()));
    expect(lines(container)).toEqual(["已记入纪录（500m）"]);
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual(["等待同步"]);
  });

  it("a reason that does not depend on the records is still shown from a cached list", () => {
    setup({ races: [race({ day: null })] });
    h.races = cached((h.races as ListState<RaceEntry>).items);
    const { container } = renderPage();
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual(["未记入：缺少比赛日期"]);
  });
});

describe("result row sync status: the five states", () => {
  it("recorded, with the record's distance name", () => {
    setup({});
    const { container } = renderPage();
    act(() => h.onData?.(reconciledEntries()));
    expect(lines(container)).toEqual(["已记入纪录（500m）"]);
  });

  it("waiting, when the record does not hold the entry yet", () => {
    setup({});
    const { container } = renderPage();
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual(["等待同步"]);
  });

  it("a project that cannot be matched to a record", () => {
    setup({ races: [race({ distanceId: "relay", label: "Relay" })] });
    const { container } = renderPage();
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual(["未记入：项目无法对应纪录"]);
  });

  it("a race without a date", () => {
    setup({ races: [race({ day: null })] });
    const { container } = renderPage();
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual(["未记入：缺少比赛日期"]);
  });

  it("an own row with no linked athlete is decided directly, without waiting for the records", () => {
    setup({ roster: [person("lindsay", { isSelf: true, athleteRefId: null }), ann] });
    const { container } = renderPage();
    // No data has arrived yet: this reason does not depend on the records.
    expect(lines(container)).toEqual(["未记入：没有关联本人运动员"]);
  });

  it("a race whose day is not one of the event's days is listed and says it is not recorded (zh, en)", () => {
    setup({ races: [race({ day: "2026-11-30" })] });
    const zh = renderPage();
    expect(lines(zh.container)).toEqual(["未记入：比赛日不在赛事日期内"]);
    zh.unmount();
    locale.current = "en";
    const en = renderPage();
    expect(lines(en.container)).toEqual(["Not recorded: the race day is not one of the event's days"]);
  });

  it("an own row linked to a different athlete says so, without waiting for the records", () => {
    setup({ roster: [person("lindsay", { isSelf: true, athleteRefId: "someone-else" }), ann] });
    const { container } = renderPage();
    expect(lines(container)).toEqual(["未记入：本人行关联的不是当前运动员"]);
  });

  it("an own row removed from the race's roster is still listed and says it is not recorded", () => {
    setup({ races: [race({ rosterIds: ["ann"] })] });
    const { container } = renderPage();
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual(["未记入：已从这场比赛的名单移除"]);
    // History is kept: the result itself is still on the page.
    expect(screen.getByText(/49\.80/)).toBeTruthy();
  });

  it("uses the English texts for the two new reasons", () => {
    locale.current = "en";
    setup({ roster: [person("lindsay", { isSelf: true, athleteRefId: "someone-else" }), ann] });
    const first = renderPage();
    expect(lines(first.container)).toEqual(["Not recorded: this row is linked to a different athlete"]);
    first.unmount();
    setup({ races: [race({ rosterIds: ["ann"] })] });
    const second = renderPage();
    expect(lines(second.container)).toEqual(["Not recorded: removed from this race's roster"]);
  });

  it("uses the English texts", () => {
    locale.current = "en";
    setup({});
    const { container } = renderPage();
    act(() => h.onData?.(reconciledEntries()));
    expect(lines(container)).toEqual(["Added to records (500m)"]);
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual(["Waiting to sync"]);
  });
});

describe("result row sync status: eventual consistency", () => {
  it("turns waiting into recorded once the reconcile has written the entry", () => {
    setup({});
    const { container } = renderPage();
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual(["等待同步"]);

    // What the sync does after the debounce: it writes the entry and the listener delivers it.
    act(() => h.onData?.(reconciledEntries()));
    expect(lines(container)).toEqual(["已记入纪录（500m）"]);
  });

  it("goes back to waiting when the time is edited and the record still holds the old one", () => {
    setup({});
    const { container, rerender } = renderPage();
    const old = reconciledEntries();
    act(() => h.onData?.(old));
    expect(lines(container)).toEqual(["已记入纪录（500m）"]);

    h.results = ready([result("lindsay", { timeSeconds: 47.5 })]);
    rerender(
      <MemoryRouter>
        <RaceRecordSyncContext.Provider value={{ failed: false, retry: () => undefined }}>
          <ResultsPage />
        </RaceRecordSyncContext.Provider>
      </MemoryRouter>,
    );
    expect(lines(container)).toEqual(["等待同步"]);
    act(() => h.onData?.(reconciledEntries()));
    expect(lines(container)).toEqual(["已记入纪录（500m）"]);
  });

  it("shows nothing while the records are loading", () => {
    setup({});
    const { container } = renderPage();
    expect(lines(container)).toEqual([]);
  });

  it("says the state is unknown, never waiting or recorded, and logs once, when the records cannot be read", () => {
    setup({});
    const { container } = renderPage();
    act(() => h.onError?.({ code: "permission-denied" }));
    expect(lines(container)).toEqual([expect.stringMatching(/^纪录读取失败，同步状态未知重试同步/)]);
    expect(screen.queryByText("等待同步")).toBeNull();
    expect(screen.queryByText(/已记入纪录/)).toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("an unconfirmed row shows no sync line when the records cannot be read", () => {
    setup({ results: [result("lindsay", { verification: "pending", verifiedAt: null })] });
    const { container } = renderPage();
    act(() => h.onError?.({ code: "permission-denied" }));
    expect(lines(container)).toEqual([]);
  });

  it("the retry rebuilds the records read: the old listener is released, a new one starts, and the row turns recorded", async () => {
    setup({});
    const { container, user } = renderPage();
    act(() => h.onError?.({ code: "unavailable" }));
    expect(h.subscribed).toBe(1);
    expect(h.unsubscribed).toBe(0);

    await user.click(within(container).getByRole("button", { name: /重试同步/ }));
    expect(h.unsubscribed).toBe(1);
    expect(h.subscribed).toBe(2);
    // The new read has not answered yet: nothing is shown, and no retry prompt is left behind.
    expect(lines(container)).toEqual([]);

    act(() => h.onData?.(reconciledEntries()));
    expect(lines(container)).toEqual(["已记入纪录（500m）"]);
  });

  it("a read that fails again after the retry shows the unknown state again", async () => {
    setup({});
    const { container, user } = renderPage();
    act(() => h.onError?.({ code: "unavailable" }));
    await user.click(within(container).getByRole("button", { name: /重试同步/ }));
    act(() => h.onError?.({ code: "unavailable" }));
    expect(lines(container)).toEqual([expect.stringMatching(/^纪录读取失败，同步状态未知重试同步/)]);
  });

  it("the unknown state is translated to English", () => {
    locale.current = "en";
    setup({});
    const { container } = renderPage();
    act(() => h.onError?.({ code: "unavailable" }));
    expect(lines(container)).toEqual([expect.stringMatching(/^Records could not be read, so the sync state is unknownRetry sync/)]);
  });

  it("still shows a reason that does not need the records, when they cannot be read", () => {
    setup({ races: [race({ day: null })] });
    const { container } = renderPage();
    act(() => h.onError?.({ code: "unavailable" }));
    expect(lines(container)).toEqual(["未记入：缺少比赛日期"]);
  });

  it("releases the records listener when the page unmounts", () => {
    setup({});
    const { unmount } = renderPage();
    expect(h.subscribed).toBe(1);
    unmount();
    expect(h.unsubscribed).toBe(1);
  });
});

describe("result row sync status: rows that get no line", () => {
  it("other people's rows, unconfirmed rows and DNS/DNF/DQ rows", () => {
    setup({
      results: [
        result("ann"),
        result("lindsay", { ...pending }),
      ],
    });
    const { container } = renderPage();
    act(() => h.onData?.([]));
    expect(lines(container)).toEqual([]);

    h.results = ready([result("lindsay", { status: "DNS", timeSeconds: null })]);
    const second = renderPage();
    act(() => h.onData?.([]));
    expect(lines(second.container)).toEqual([]);
  });
});

describe("result row sync status: failure and retry", () => {
  it("offers a retry on the waiting row, with no error detail, and runs the same sync again", async () => {
    setup({});
    const retry = vi.fn();
    const { container, user } = renderPage({ failed: true, retry });
    act(() => h.onData?.([]));

    const notice = container.querySelector('[data-sync="failed"]') as HTMLElement;
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).toContain("同步暂时没有成功。");
    expect(screen.queryByText("等待同步")).toBeNull();
    expect(notice.textContent).not.toMatch(/permission|unavailable|code/i);

    await user.click(within(notice).getByRole("button", { name: /重试同步/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("does not put a retry on a recorded row, even when the last run failed", () => {
    setup({});
    const { container } = renderPage({ failed: true, retry: () => undefined });
    act(() => h.onData?.(reconciledEntries()));
    expect(lines(container)).toEqual(["已记入纪录（500m）"]);
    expect(container.querySelector('[data-sync="failed"]')).toBeNull();
  });
});

describe("the hint beside the confirm button", () => {
  const hint = "确认后会记入纪录页";

  it("shows on an unconfirmed own row that would be recorded, and is tied to the button", () => {
    setup({ results: [result("lindsay", { ...pending })] });
    renderPage();
    act(() => h.onData?.([]));
    const button = screen.getByRole("button", { name: /标记为已确认/ });
    const text = screen.getByText(hint);
    expect(button.getAttribute("aria-describedby")).toBe(text.id);
  });

  it("is also true English", () => {
    locale.current = "en";
    setup({ results: [result("lindsay", { ...pending })] });
    renderPage();
    act(() => h.onData?.([]));
    expect(screen.getByText("Once confirmed, it is added to the records page")).toBeTruthy();
  });

  it.each([
    ["an unmappable project", { races: [race({ distanceId: "relay", label: "Relay" })] }],
    ["a race without a date", { races: [race({ day: null })] }],
    ["no linked athlete", { roster: [person("lindsay", { isSelf: true, athleteRefId: null }), ann] }],
  ])("is not shown for %s", (_name, over) => {
    setup({ ...over, results: [result("lindsay", { ...pending })] });
    renderPage();
    act(() => h.onData?.([]));
    expect(screen.queryByText(hint)).toBeNull();
  });

  it("is not shown for DNS, for another person's row, or on a confirmed row", () => {
    setup({
      results: [
        result("lindsay", { ...pending, status: "DNS", timeSeconds: null }),
        result("ann", { ...pending }),
      ],
    });
    renderPage();
    act(() => h.onData?.([]));
    expect(screen.queryByText(hint)).toBeNull();

    setup({});
    renderPage();
    act(() => h.onData?.([]));
    expect(screen.queryByText(hint)).toBeNull();
  });
});
