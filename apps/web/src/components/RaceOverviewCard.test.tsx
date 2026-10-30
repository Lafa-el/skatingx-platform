// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceResult } from "@skatingx/schema";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RaceOverview, RaceOverviewNext, RaceOverviewPrevious } from "@/hooks/useRaceOverview";
import { render, screen, within } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

import { RaceOverviewCard } from "./RaceOverviewCard";

const h = vi.hoisted(() => ({ locale: "zh" as "zh" | "en", overview: { status: "loading" } as unknown }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => h.locale }));
vi.mock("@/hooks/useRaceOverview", () => ({ useRaceOverview: () => h.overview }));

afterEach(() => {
  h.locale = "zh";
  h.overview = { status: "loading" };
});

const prov = { verification: "verified", source: "manual", sourceNote: "", verifiedAt: null, schemaVersion: 1 };
const event = (over: Partial<RaceEvent> = {}): RaceEvent =>
  ({ eventId: "e", name: "Nationals", dates: [], timeZone: "America/New_York", venue: null, ...prov, ...over }) as RaceEvent;
const race = (raceId: string, label: string): RaceEntry => ({ raceId, label }) as RaceEntry;
const res = (raceId: string, over: Partial<RaceResult> = {}): RaceResult =>
  ({ resultId: `${raceId}_me`, raceId, rosterId: "me", status: "finished", timeSeconds: 48.594, place: 1, ...prov, ...over }) as RaceResult;

const next = (over: Partial<RaceOverviewNext> = {}, pickOver: Record<string, unknown> = {}): RaceOverviewNext => ({
  pick: {
    event: event({ name: "Nationals", venue: "Salt Lake City" }),
    firstDay: "2026-11-07",
    lastDay: "2026-11-08",
    status: "upcoming",
    zoneKnown: true,
    daysUntil: 8,
    ...pickOver,
  } as RaceOverviewNext["pick"],
  division: "Senior A",
  detail: "ready",
  ...over,
});
const previous = (over: Partial<RaceOverviewPrevious> = {}, pickOver: Record<string, unknown> = {}): RaceOverviewPrevious => ({
  pick: {
    event: event({ name: "Buffalo Champs" }),
    firstDay: "2026-10-24",
    lastDay: "2026-10-25",
    status: "past",
    zoneKnown: true,
    daysUntil: null,
    ...pickOver,
  } as RaceOverviewPrevious["pick"],
  results: [
    { result: res("a", { place: 2 }), race: race("a", "500m") },
    { result: res("b", { place: null, verification: "pending", timeSeconds: 105.395 }), race: race("b", "1000m") },
  ],
  detail: "ready",
  ...over,
});
const ready = (over: Partial<Extract<RaceOverview, { status: "ready" }>> = {}): RaceOverview => ({
  status: "ready",
  eventCount: 2,
  hiddenCount: 0,
  next: next(),
  previous: previous(),
  ...over,
});

const renderCard = (overview: RaceOverview, locale: "zh" | "en" = "zh") => {
  h.overview = overview;
  h.locale = locale;
  return render(
    <MemoryRouter>
      <RaceOverviewCard />
    </MemoryRouter>,
  );
};
const block = (name: string) => {
  const section = screen.getByRole("region", { name });
  return within(section);
};
const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");

describe("RaceOverviewCard: states", () => {
  it("while loading: a status line, not an empty state", () => {
    renderCard({ status: "loading" });
    expect(screen.getByRole("heading", { level: 3, name: "比赛日" })).toBeTruthy();
    expect(screen.getByText("正在加载比赛日…")).toBeTruthy();
    expect(screen.queryByText("还没有比赛日赛事。")).toBeNull();
  });

  it("a failed read says so, as an alert, and never claims there are no events", () => {
    renderCard({ status: "error", permissionDenied: false });
    expect(screen.getByRole("alert").textContent).toBe("暂时无法加载比赛日数据，请稍后再试。");
    expect(screen.queryByText("还没有比赛日赛事。")).toBeNull();
  });

  it("permission denied has its own sentence, in both languages", () => {
    const zh = renderCard({ status: "error", permissionDenied: true });
    expect(screen.getByRole("alert").textContent).toBe("没有权限读取比赛日数据。");
    zh.unmount();
    renderCard({ status: "error", permissionDenied: true }, "en");
    expect(screen.getByRole("alert").textContent).toBe("You don't have permission to read Race Day data.");
  });

  it("no events at all: one empty state that leads to the setup page", () => {
    renderCard(ready({ eventCount: 0, next: null, previous: null }));
    expect(screen.getByText("还没有比赛日赛事。")).toBeTruthy();
    expect(href("去创建赛事 →")).toBe("/race-day/setup");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("only a previous event: the next block says there is none, the card stays", () => {
    renderCard(ready({ next: null }));
    expect(block("下一场").getByText("没有即将开始的比赛。")).toBeTruthy();
    expect(block("上一场").getByText("Buffalo Champs")).toBeTruthy();
  });

  it("only a next event: the previous block says there is none", () => {
    renderCard(ready({ previous: null }));
    expect(block("上一场").getByText("还没有已结束的比赛。")).toBeTruthy();
    expect(block("下一场").getByText("Nationals")).toBeTruthy();
  });

  it("events that exist but take no part (no valid day) are not 'no events'", () => {
    renderCard(ready({ eventCount: 1, next: null, previous: null }));
    expect(screen.queryByText("还没有比赛日赛事。")).toBeNull();
    expect(screen.getByText("没有即将开始的比赛。")).toBeTruthy();
    expect(screen.getByText("还没有已结束的比赛。")).toBeTruthy();
  });

  it("says how many event records could not be read", () => {
    renderCard(ready({ hiddenCount: 2 }));
    expect(screen.getByText("有 2 个赛事的数据无法读取，没有显示在这里。")).toBeTruthy();
  });

  it("unreadable records alone still do not look like 'no events'", () => {
    renderCard(ready({ eventCount: 0, hiddenCount: 1, next: null, previous: null }));
    expect(screen.queryByText("还没有比赛日赛事。")).toBeNull();
    expect(screen.getByText(/无法读取/)).toBeTruthy();
  });
});

describe("RaceOverviewCard: next event", () => {
  it("Chinese: name, date range, venue, division and the day count", () => {
    renderCard(ready());
    const next = block("下一场");
    expect(next.getByText("Nationals")).toBeTruthy();
    expect(next.getByText("2026年11月7日 – 2026年11月8日")).toBeTruthy();
    expect(next.getByText("场馆：Salt Lake City")).toBeTruthy();
    expect(next.getByText("组别：Senior A")).toBeTruthy();
    expect(next.getByText("还有 8 天")).toBeTruthy();
    expect(next.queryByText("时区待确认")).toBeNull();
    expect(next.queryByText("进行中")).toBeNull();
  });

  it("English: the same, with a singular day", () => {
    renderCard(ready({ next: next({}, { daysUntil: 1 }) }), "en");
    const n = block("Next event");
    expect(n.getByText("Nov 7, 2026 – Nov 8, 2026")).toBeTruthy();
    expect(n.getByText("Venue: Salt Lake City")).toBeTruthy();
    expect(n.getByText("Division: Senior A")).toBeTruthy();
    expect(n.getByText("In 1 day")).toBeTruthy();
  });

  it("a one-day event shows one date, and no venue or division line when they are unknown", () => {
    renderCard(
      ready({ next: next({ division: null, pick: next({}, { lastDay: "2026-11-07" }).pick }) }),
    );
    const n = block("下一场");
    expect(n.getByText("2026年11月7日")).toBeTruthy();
    expect(n.queryByText(/组别/)).toBeNull();
  });

  it("no venue line when the venue is null", () => {
    renderCard(ready({ next: next({ pick: next({}, { event: event({ venue: null }) }).pick }) }));
    expect(block("下一场").queryByText(/场馆/)).toBeNull();
  });

  it("an event under way is marked in progress and has no day count", () => {
    renderCard(ready({ next: next({}, { status: "ongoing", daysUntil: null }) }));
    const n = block("下一场");
    expect(n.getByText("进行中")).toBeTruthy();
    expect(n.queryByText(/还有/)).toBeNull();
  });

  it("an event with no time zone shows only its date, no count, and says the zone is pending", () => {
    renderCard(ready({ next: next({}, { zoneKnown: false, daysUntil: null }) }));
    const n = block("下一场");
    expect(n.getByText("时区待确认")).toBeTruthy();
    expect(n.queryByText(/还有/)).toBeNull();
    expect(n.getByText("2026年11月7日 – 2026年11月8日")).toBeTruthy();
  });

  it("an unconfirmed event is marked, a confirmed one is not", () => {
    const pending = renderCard(ready({ next: next({ pick: next({}, { event: event({ verification: "pending" }) }).pick }) }));
    expect(block("下一场").getByText("赛事待确认")).toBeTruthy();
    pending.unmount();
    renderCard(ready());
    expect(block("下一场").queryByText("赛事待确认")).toBeNull();
  });

  it("a failed division read says so instead of showing nothing quietly", () => {
    renderCard(ready({ next: next({ division: null, detail: "error" }) }));
    expect(block("下一场").getByText("组别暂时无法加载。")).toBeTruthy();
  });

  it("leads to the Race Day home", () => {
    renderCard(ready());
    expect(href("打开比赛日 →")).toBe("/race-day");
  });
});

describe("RaceOverviewCard: previous event", () => {
  it("Chinese: name, dates, and each result with its project, time, place and mark", () => {
    renderCard(ready());
    const p = block("上一场");
    expect(p.getByText("Buffalo Champs")).toBeTruthy();
    expect(p.getByText("2026年10月24日 – 2026年10月25日")).toBeTruthy();
    const rows = p.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("500m")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("48.594")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("第 2 名")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("已确认")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("1:45.395")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("待确认")).toBeTruthy();
  });

  it("a result with no place does not show a place", () => {
    renderCard(ready());
    const second = block("上一场").getAllByRole("listitem")[1] as HTMLElement;
    expect(within(second).queryByText(/第/)).toBeNull();
  });

  it("English wording", () => {
    renderCard(ready(), "en");
    const rows = block("Previous event").getAllByRole("listitem");
    expect(within(rows[0] as HTMLElement).getByText("Place 2")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("Verified")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("Pending")).toBeTruthy();
  });

  it("a result without a time shows its status instead", () => {
    renderCard(
      ready({
        previous: previous({
          results: [{ result: res("a", { status: "DNF", timeSeconds: null, place: null }), race: race("a", "1500m") }],
        }),
      }),
    );
    expect(block("上一场").getByText("未完赛（DNF）")).toBeTruthy();
  });

  it("no results of the own athlete: a sentence, not an empty list", () => {
    renderCard(ready({ previous: previous({ results: [] }) }));
    expect(block("上一场").getByText("还没有你的成绩。")).toBeTruthy();
    expect(block("上一场").queryByRole("list")).toBeNull();
  });

  it("results still loading, and results that failed to load, are told apart from 'none'", () => {
    const loading = renderCard(ready({ previous: previous({ results: [], detail: "loading" }) }));
    expect(block("上一场").getByText("正在加载成绩…")).toBeTruthy();
    expect(block("上一场").queryByText("还没有你的成绩。")).toBeNull();
    loading.unmount();
    renderCard(ready({ previous: previous({ results: [], detail: "error" }) }));
    expect(block("上一场").getByText("成绩暂时无法加载。")).toBeTruthy();
    expect(block("上一场").queryByText("还没有你的成绩。")).toBeNull();
  });

  it("marks an event whose time zone is unknown, and an unconfirmed one", () => {
    renderCard(ready({ previous: previous({ pick: previous({}, { zoneKnown: false, event: event({ name: "X", verification: "pending" }) }).pick }) }));
    const p = block("上一场");
    expect(p.getByText("时区待确认")).toBeTruthy();
    expect(p.getByText("赛事待确认")).toBeTruthy();
  });

  it("leads to the results page", () => {
    renderCard(ready());
    expect(href("查看成绩 →")).toBe("/race-day/results");
  });
});

describe("RaceOverviewCard: look", () => {
  it("uses no old colour class in any state, in either language", () => {
    for (const locale of ["zh", "en"] as const) {
      for (const overview of [
        ready(),
        ready({ next: null }),
        ready({ eventCount: 0, next: null, previous: null }),
        { status: "error", permissionDenied: true } as RaceOverview,
        { status: "loading" } as RaceOverview,
      ]) {
        const { container, unmount } = renderCard(overview, locale);
        expect(legacyColourClasses(container)).toEqual([]);
        unmount();
      }
    }
  });

  it("every mark is words as well as colour", () => {
    const { container } = renderCard(ready());
    for (const tag of container.querySelectorAll("[data-tone]")) {
      expect((tag.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("the whole card spans the grid row", () => {
    renderCard(ready());
    const article = screen.getByRole("heading", { level: 3, name: "比赛日" }).closest("article");
    expect(article?.className).toContain("sm:col-span-2");
    expect(article?.className).toContain("lg:col-span-3");
  });
});
