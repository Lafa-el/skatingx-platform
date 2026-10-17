// @vitest-environment happy-dom
import { getAcademyStages } from "@skatingx/content";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/dom";

import { TrainingHomePage } from "./TrainingHomePage";

type Hook = { data: unknown; loading: boolean; error: string | null };

const h = vi.hoisted(() => {
  const ready = (data: unknown): Hook => ({ data, loading: false, error: null });
  const base = () => ({
    settings: ready({ language: "zh", isPro: false }),
    profile: ready({ displayName: "Sample Skater" }),
    gamification: ready({ points: 120, streakDays: 3 }),
    training: ready({ todayTasks: [{ completed: true }, { completed: false }] }),
    records: {
      loading: false,
      error: null as string | null,
      totalEntryCount: 5,
      getBestForDistance: (_distance: string): { timeSeconds: number } | null => ({ timeSeconds: 52.34 }),
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
vi.mock("@/hooks/useTrainingRecords", () => ({ useTrainingRecords: () => h.state.records }));
vi.mock("@/components/FirestoreStatusBanner", () => ({ FirestoreStatusBanner: () => null }));
// Tasks arrive already normalized in this test.
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
      <TrainingHomePage />
    </MemoryRouter>,
  );

// The page shows the second stage when there is one. Its names and age range are content data,
// so the test reads the same content instead of copying it.
const stage = getAcademyStages()[1] ?? getAcademyStages()[0]!;

const card = (title: string) => {
  const article = screen.getByRole("heading", { level: 3, name: title }).closest("article");
  if (!article) {
    throw new Error(`no card titled ${title}`);
  }
  return within(article);
};

describe("TrainingHomePage: Chinese", () => {
  it("titles, intro and every card", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "训练" })).toBeTruthy();
    expect(screen.getByText("每日任务、学院、纪录和商店——任务数据已实时保存在数据服务中。")).toBeTruthy();
    for (const title of ["运动员", "积分", "连续天数", "今日任务", "纪录", "商店 / 奖励", "学院"]) {
      expect(screen.getByRole("heading", { level: 3, name: title }), title).toBeTruthy();
    }
  });

  it("values: name, points, streak, tasks, records and the 500m best", () => {
    renderPage();
    expect(card("运动员").getByText("Sample Skater")).toBeTruthy();
    expect(card("积分").getByText("120")).toBeTruthy();
    expect(card("连续天数").getByText("3 天")).toBeTruthy();
    expect(card("今日任务").getByText("1 / 2")).toBeTruthy();
    expect(card("纪录").getByText("5 条纪录")).toBeTruthy();
    expect(card("纪录").getByText(/^500m 个人最好 /)).toBeTruthy();
  });

  it("no 500m best yet", () => {
    h.state.records.getBestForDistance = () => null;
    renderPage();
    expect(card("纪录").getByText("还没有 500m 个人最好成绩")).toBeTruthy();
  });

  it("shop card follows the Pro flag", () => {
    const free = renderPage();
    expect(card("商店 / 奖励").getByText("120 积分")).toBeTruthy();
    expect(card("商店 / 奖励").getByText("免费版 · 仅目录奖励")).toBeTruthy();
    free.unmount();

    setLanguage("zh", true);
    renderPage();
    expect(card("商店 / 奖励").getByText("PRO 已开启 · 目录奖励 + 自定义奖励(占位)")).toBeTruthy();
  });

  it("academy card names the reference stage and its age range as stored", () => {
    renderPage();
    expect(card("学院").getByText(`参考阶段:${stage.labelZh}(${stage.ageRange})`)).toBeTruthy();
  });

  it("the four shortcuts and their lines", () => {
    renderPage();
    const link = (to: string) => document.querySelector(`a[href="${to}"].rounded-xl`) as HTMLElement;
    expect(link("/training/tasks").textContent).toBe("任务添加并完成今天的清单");
    expect(link("/training/academy").textContent).toBe(`学院${stage.labelZh} · 陆地训练计划`);
    expect(link("/training/records").textContent).toBe("纪录各距离的个人最好成绩");
    expect(link("/training/shop").textContent).toBe("商店可用 120 积分");
  });

  it("the card links keep their destinations and say where they go", () => {
    renderPage();
    const open = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(open("打开任务清单 →")).toBe("/training/tasks");
    expect(open("打开纪录 →")).toBe("/training/records");
    expect(open("打开商店 →")).toBe("/training/shop");
    expect(open("打开学院 →")).toBe("/training/academy");
  });
});

describe("TrainingHomePage: English", () => {
  it("keeps the previous wording", () => {
    setLanguage("en");
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Training" })).toBeTruthy();
    expect(
      screen.getByText("Daily tasks, academy, records, and shop — tasks are live on Firestore."),
    ).toBeTruthy();
    for (const title of ["Athlete", "Points", "Streak", "Today's tasks", "Records", "Shop / Rewards", "Academy"]) {
      expect(screen.getByRole("heading", { level: 3, name: title }), title).toBeTruthy();
    }
    expect(card("Streak").getByText("3 days")).toBeTruthy();
    expect(card("Records").getByText("5 entries")).toBeTruthy();
    expect(card("Records").getByText(/^500m PB /)).toBeTruthy();
    expect(card("Shop / Rewards").getByText("120 points")).toBeTruthy();
    expect(card("Shop / Rewards").getByText("Free plan · catalog rewards only")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open task list →" })).toBeTruthy();
  });

  it("English academy card and shortcuts", () => {
    setLanguage("en");
    renderPage();
    expect(card("Academy").getByText(`Reference stage: ${stage.labelEn} (${stage.ageRange})`)).toBeTruthy();
    const link = (to: string) => document.querySelector(`a[href="${to}"].rounded-xl`) as HTMLElement;
    expect(link("/training/tasks").textContent).toBe("TasksAdd and complete today's list");
    expect(link("/training/academy").textContent).toBe(`Academy${stage.labelEn} · dryland plans`);
    expect(link("/training/records").textContent).toBe("RecordsPB times by distance");
    expect(link("/training/shop").textContent).toBe("Shop120 points available");
  });

  it("English: one is singular (day, entry, point), zero is plural", () => {
    setLanguage("en");
    h.state.gamification = h.ready({ points: 1, streakDays: 1 });
    h.state.records.totalEntryCount = 1;
    const one = renderPage();
    expect(card("Streak").getByText("1 day")).toBeTruthy();
    expect(card("Records").getByText("1 entry")).toBeTruthy();
    expect(card("Shop / Rewards").getByText("1 point")).toBeTruthy();
    expect(document.querySelector('a[href="/training/shop"].rounded-xl')?.textContent).toBe("Shop1 point available");
    one.unmount();

    h.state.gamification = h.ready({ points: 0, streakDays: 0 });
    h.state.records.totalEntryCount = 0;
    renderPage();
    expect(card("Streak").getByText("0 days")).toBeTruthy();
    expect(card("Records").getByText("0 entries")).toBeTruthy();
    expect(card("Shop / Rewards").getByText("0 points")).toBeTruthy();
  });

  it("English: Pro plan and no 500m best", () => {
    setLanguage("en", true);
    h.state.records.getBestForDistance = () => null;
    renderPage();
    expect(card("Shop / Rewards").getByText("PRO active · catalog + custom rewards (placeholder)")).toBeTruthy();
    expect(card("Records").getByText("No 500m PB yet")).toBeTruthy();
  });
});

describe("TrainingHomePage: long names on a phone", () => {
  // Layout is not computed in happy-dom, so the wrapping is pinned through its classes; the
  // rendered width at 320px and 375px was measured in a browser with an unbroken 50-letter name.
  it("lets an unbroken athlete name wrap inside its card instead of widening the page", () => {
    renderPage();
    const name = card("运动员").getByText("Sample Skater");
    expect(name.className).toContain("break-words");
    expect(screen.getByRole("heading", { level: 3, name: "运动员" }).closest("article")?.className).toContain("min-w-0");
  });
});

describe("TrainingHomePage: states", () => {
  it("while loading, the values are an ellipsis, not zeros", () => {
    h.state.gamification = { data: null, loading: true, error: null };
    renderPage();
    expect(card("运动员").getByText("…")).toBeTruthy();
    expect(card("积分").getByText("…")).toBeTruthy();
    expect(card("连续天数").getByText("…")).toBeTruthy();
    expect(card("商店 / 奖励").getAllByText("…").length).toBe(2);
  });

  it("a data error is shown as an alert, as received", () => {
    h.state.training = { data: null, loading: false, error: "Some technical reason" };
    renderPage();
    expect(screen.getByRole("alert").textContent).toBe("Some technical reason");
  });

  it("when both fail, the page error comes first, and only one alert is shown", () => {
    h.state.training = { data: null, loading: false, error: "Page error" };
    h.state.records.error = "Records error";
    renderPage();
    expect(screen.getAllByRole("alert").map((e) => e.textContent)).toEqual(["Page error"]);
  });

  it("a records error is shown as an alert too", () => {
    h.state.records.error = "Records unavailable";
    renderPage();
    expect(screen.getByRole("alert").textContent).toBe("Records unavailable");
  });

  it("a missing profile shows a dash", () => {
    h.state.profile = h.ready(null);
    renderPage();
    expect(card("运动员").getByText("—")).toBeTruthy();
  });

  it("the language follows the settings, and Chinese is the default while they are not there", () => {
    h.state.settings = h.ready(null);
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "训练" })).toBeTruthy();
  });
});
