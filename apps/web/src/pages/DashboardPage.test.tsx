// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/dom";

import { DashboardPage } from "./DashboardPage";

type Hook = { data: unknown; loading: boolean; error: string | null };

const h = vi.hoisted(() => {
  const ready = (data: unknown): Hook => ({ data, loading: false, error: null });
  const base = () => ({
    settings: ready({ language: "zh", isPro: false }),
    profile: ready({ displayName: "Sample Skater" }),
    gamification: ready({ points: 120, streakDays: 3 }),
    training: ready({ todayTasks: [{ completed: true }, { completed: false }, { completed: true }] }),
    records: {
      loading: false,
      error: null as string | null,
      getBestForDistance: (_distance: string): { timeSeconds: number; date: string } | null => null,
      latestEntryOverall: null as { timeSeconds: number; date: string } | null,
    },
    shop: {
      loading: false,
      error: null as string | null,
      catalog: null as { items: { id: string; nameZh: string; nameEn: string }[] } | null,
      latestRedemption: null as { rewardId: string; rewardName: string; cost: number; redeemedAt: string } | null,
    },
  });
  return { ready, base, state: base() };
});

vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => h.state.settings,
  useAthleteProfile: () => h.state.profile,
  useGamification: () => h.state.gamification,
  useTrainingState: () => h.state.training,
}));
vi.mock("@/hooks/useRewardsShop", () => ({ useRewardsShop: () => h.state.shop }));
vi.mock("@/hooks/useTrainingRecords", () => ({ useTrainingRecords: () => h.state.records }));
vi.mock("@/components/FirestoreStatusBanner", () => ({ FirestoreStatusBanner: () => null }));
// The real one reads the training document; tasks arrive already normalized in this test.
vi.mock("@skatingx/firebase-client", () => ({ normalizeTrainingState: (state: unknown) => state }));

const setLanguage = (language: "zh" | "en", isPro = false) => {
  h.state.settings = h.ready({ language, isPro });
};

afterEach(() => {
  h.state = h.base();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );

/** The card with this title (the shared Card renders an <article> with an <h3>). */
const card = (title: string) => {
  const article = screen.getByRole("heading", { level: 3, name: title }).closest("article");
  if (!article) {
    throw new Error(`no card titled ${title}`);
  }
  return within(article);
};

describe("DashboardPage: headings", () => {
  it("Chinese: title, welcome line and every card title", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "总览" })).toBeTruthy();
    expect(screen.getByText("欢迎回来，Sample Skater")).toBeTruthy();
    for (const title of [
      "运动员",
      "积分",
      "连续天数",
      "今日任务",
      "500m 个人最好",
      "最快单圈个人最好",
      "方案",
      "最近兑换",
      "最近纪录",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: title }), title).toBeTruthy();
    }
  });

  it("English: the previous wording", () => {
    setLanguage("en");
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Welcome back, Sample Skater")).toBeTruthy();
    for (const title of [
      "Athlete",
      "Points",
      "Streak",
      "Today's tasks",
      "500m PB",
      "Fastest lap PB",
      "Plan",
      "Latest redemption",
      "Latest record",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: title }), title).toBeTruthy();
    }
    expect(screen.getByText("completed / total")).toBeTruthy();
  });
});

describe("DashboardPage: values", () => {
  it("Chinese: points, streak in the language's unit, and the task count", () => {
    renderPage();
    expect(card("积分").getByText("120")).toBeTruthy();
    expect(card("连续天数").getByText("3 天")).toBeTruthy();
    expect(card("今日任务").getByText("2 / 3")).toBeTruthy();
    expect(card("今日任务").getByText("已完成 / 总数")).toBeTruthy();
  });

  it("English: streak unit", () => {
    setLanguage("en");
    renderPage();
    expect(card("Streak").getByText("3 days")).toBeTruthy();
  });

  it("English: a streak of one day is singular, zero is plural", () => {
    setLanguage("en");
    h.state.gamification = h.ready({ points: 120, streakDays: 1 });
    const first = renderPage();
    expect(card("Streak").getByText("1 day")).toBeTruthy();
    first.unmount();

    h.state.gamification = h.ready({ points: 120, streakDays: 0 });
    renderPage();
    expect(card("Streak").getByText("0 days")).toBeTruthy();
  });

  it("Chinese: a streak of one day uses the same unit", () => {
    h.state.gamification = h.ready({ points: 120, streakDays: 1 });
    renderPage();
    expect(card("连续天数").getByText("1 天")).toBeTruthy();
  });

  it("the plan card follows the Pro flag (free)", () => {
    renderPage();
    expect(card("方案").getByText("免费版")).toBeTruthy();
  });

  it("the plan card follows the Pro flag (Pro, Chinese)", () => {
    setLanguage("zh", true);
    renderPage();
    expect(card("方案").getByText("PRO 已开通")).toBeTruthy();
  });

  it("the plan card follows the Pro flag (Pro and free, English)", () => {
    setLanguage("en", true);
    const first = renderPage();
    expect(card("Plan").getByText("PRO active")).toBeTruthy();
    first.unmount();
    setLanguage("en", false);
    renderPage();
    expect(card("Plan").getByText("Free plan")).toBeTruthy();
  });

  it("the athlete's name is shown as stored", () => {
    renderPage();
    expect(card("运动员").getByText("Sample Skater")).toBeTruthy();
  });
});

describe("DashboardPage: empty and loading states", () => {
  it("Chinese: no records and no redemptions say so", () => {
    renderPage();
    expect(card("最近纪录").getByText("还没有纪录")).toBeTruthy();
    expect(card("最近兑换").getByText("还没有兑换记录")).toBeTruthy();
  });

  it("English: the previous wording", () => {
    setLanguage("en");
    renderPage();
    expect(card("Latest record").getByText("No entries yet")).toBeTruthy();
    expect(card("Latest redemption").getByText("No redemptions yet")).toBeTruthy();
  });

  it("while data loads: a loading line, no welcome, placeholders in the cards", () => {
    h.state.profile = { data: null, loading: true, error: null };
    renderPage();
    expect(screen.getByText("正在加载总览…")).toBeTruthy();
    expect(screen.queryByText(/欢迎回来/)).toBeNull();
    expect(card("积分").getByText("…")).toBeTruthy();
  });

  it("while data loads, English", () => {
    setLanguage("en");
    h.state.profile = { data: null, loading: true, error: null };
    renderPage();
    expect(screen.getByText("Loading your dashboard…")).toBeTruthy();
  });

  it("an error from the data layer is shown as an alert, exactly as received", () => {
    h.state.records = { ...h.state.records, error: "Some technical reason" };
    renderPage();
    expect(screen.getByRole("alert").textContent).toBe("Some technical reason");
  });
});

describe("DashboardPage: records and redemptions", () => {
  const withRecords = () => {
    h.state.records = {
      loading: false,
      error: null,
      getBestForDistance: (distance: string) =>
        distance === "500m" ? { timeSeconds: 45.5, date: "2026-10-16" } : null,
      latestEntryOverall: { timeSeconds: 50, date: "2026-10-15" },
    };
  };

  it("Chinese: dates are written the way Chinese writes them", () => {
    withRecords();
    renderPage();
    expect(card("500m 个人最好").getByText("2026年10月16日")).toBeTruthy();
    expect(card("最近纪录").getByText("2026年10月15日")).toBeTruthy();
    // No stored best for this distance: a dash and no date.
    expect(card("最快单圈个人最好").getByText("—")).toBeTruthy();
  });

  it("the fastest-lap best shows its time and date too", () => {
    h.state.records = {
      loading: false,
      error: null,
      getBestForDistance: (distance: string) =>
        distance === "fastest_lap" ? { timeSeconds: 12.34, date: "2026-09-01" } : null,
      latestEntryOverall: null,
    };
    renderPage();
    expect(card("最快单圈个人最好").getByText("2026年9月1日")).toBeTruthy();
    expect(card("500m 个人最好").getByText("—")).toBeTruthy();
  });

  it("English: dates are written the way English writes them", () => {
    withRecords();
    setLanguage("en");
    renderPage();
    expect(card("500m PB").getByText("Oct 16, 2026")).toBeTruthy();
    expect(card("Latest record").getByText("Oct 15, 2026")).toBeTruthy();
  });

  const withRedemption = () => {
    h.state.shop = {
      loading: false,
      error: null,
      catalog: null,
      latestRedemption: {
        rewardId: "sample",
        rewardName: "Sample Reward",
        cost: 50,
        redeemedAt: "2026-10-14T18:30:00.000Z",
      },
    };
  };

  it("Chinese: a redemption shows the reward name as stored, the cost in 积分 and the date", () => {
    withRedemption();
    renderPage();
    expect(card("最近兑换").getByText("Sample Reward")).toBeTruthy();
    expect(card("最近兑换").getByText("−50 积分 · 2026年10月14日")).toBeTruthy();
  });

  it("the reward name follows the language when the catalog knows the reward, as on the shop page", () => {
    withRedemption();
    h.state.shop.catalog = { items: [{ id: "sample", nameZh: "示例奖励", nameEn: "Sample (catalog)" }] };
    const zh = renderPage();
    expect(card("最近兑换").getByText("示例奖励")).toBeTruthy();
    zh.unmount();
    setLanguage("en");
    renderPage();
    expect(card("Latest redemption").getByText("Sample (catalog)")).toBeTruthy();
  });

  it("English: a redemption, previous unit", () => {
    withRedemption();
    setLanguage("en");
    renderPage();
    expect(card("Latest redemption").getByText("−50 pts · Oct 14, 2026")).toBeTruthy();
  });
});

describe("DashboardPage: shortcut cards", () => {
  it("lead to the same places in either language", () => {
    renderPage();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/training/tasks",
      "/analysis",
      "/athlete",
      "/ai-coach",
    ]);
  });

  it("Chinese text", () => {
    renderPage();
    for (const text of [
      "今日训练",
      "查看并完成今天的任务清单。",
      "最新分析",
      "动作分析、配速和装备分析。",
      "运动员档案",
      "档案、组别和头像设置。",
      "AI 教练建议",
      "根据你的数据给出个性化的训练建议。",
    ]) {
      expect(screen.getByText(text), text).toBeTruthy();
    }
    expect(screen.getAllByText("打开 →")).toHaveLength(4);
  });

  it("English text is the previous wording", () => {
    setLanguage("en");
    renderPage();
    for (const text of [
      "Today's Training",
      "View and complete today's task list.",
      "Latest Analysis",
      "Biomechanics, pacing, and equipment insights.",
      "Athlete Profile",
      "Profile, division, and avatar settings.",
      "AI Coach Recommendation",
      "Personalized coaching suggestions from your data.",
    ]) {
      expect(screen.getByText(text), text).toBeTruthy();
    }
    expect(screen.getAllByText("Open →")).toHaveLength(4);
  });
});
