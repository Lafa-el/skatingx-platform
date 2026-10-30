// @vitest-environment happy-dom
import { todayDateString } from "@skatingx/schema";
import { mondayOfWeek, PLAN_DAYS } from "@skatingx/skating-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { TrainingPlanPage } from "@/pages/training/TrainingPlanPage";
import { act, render, screen, userEvent, within } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

import { PLAN_DAY_COPY } from "./plan-day-copy";
import planPageSource from "./PlanPage.tsx?raw";

type Row = { id: string; text: string; completed: boolean; source?: string };
type ArchivedDay = { dateId: string; tasks: Row[] };

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: "user-1" as string | null,
  db: {} as object | null,
  onAnalyses: null as
    | ((rows: { kind: "pace" | "biomech"; id: string; createdAt: string; findings: { code: string }[] }[]) => void)
    | null,
  onEquipment: null as ((rows: { id: string; createdAt: string; findings?: { code: string }[] }[]) => void) | null,
  stopFeedback: vi.fn(),
  // The week's earlier days, read from the day archive.
  history: null as {
    args: unknown[];
    onDays: (days: ArchivedDay[]) => void;
    onError: (error: unknown) => void;
  } | null,
  stopHistory: vi.fn(),
  historySubscriptions: 0,
  // The training state the focus and today's tasks are on (ADR-008). A tiny store so a write re-renders.
  training: {
    value: null as Record<string, unknown> | null,
    loading: false,
    error: null as string | null,
    listeners: new Set<() => void>(),
  },
  setPlanFocus: vi.fn(),
  setPlanFocusFails: false,
}));

const thisMonday = () => mondayOfWeek(todayDateString());

function emit() {
  for (const listener of state.training.listeners) listener();
}

/** Replaces the training state, as a snapshot from the cloud would. */
function setTraining(value: Record<string, unknown> | null) {
  act(() => {
    state.training.value = value;
    emit();
  });
}

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: false, firebaseReady: Boolean(state.uid) }),
}));
vi.mock("@/app/providers/FirestoreProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useTrainingState: () => ({
      data: useSyncExternalStore(
        (listener) => {
          state.training.listeners.add(listener);
          return () => state.training.listeners.delete(listener);
        },
        () => state.training.value,
      ),
      loading: state.training.loading,
      error: state.training.error,
    }),
    useUserSettings: () => ({ data: { activeAthleteId: "lindsay" }, loading: false, error: null }),
  };
});
// Only what the page may use. It has no check-in function to call: touching one would throw here.
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  setPlanFocus: async (ctx: unknown, focus: string) => {
    state.setPlanFocus(ctx, focus);
    if (state.setPlanFocusFails) throw new Error("write");
    state.training.value = {
      ...(state.training.value ?? {}),
      planFocus: focus,
      planFocusWeek: thisMonday(),
      todayTasks: (state.training.value?.todayTasks as unknown[] | undefined) ?? [],
    };
    emit();
  },
  subscribeToTaskHistoryMonth: (
    db: unknown,
    uid: unknown,
    athlete: unknown,
    start: string,
    end: string,
    onDays: (days: ArchivedDay[]) => void,
    onError: (error: unknown) => void,
  ) => {
    state.historySubscriptions += 1;
    state.history = { args: [db, uid, athlete, start, end], onDays, onError };
    return state.stopHistory;
  },
  subscribeToSavedAnalyses: (
    _db: unknown,
    _uid: unknown,
    onData: (rows: { kind: "pace" | "biomech"; id: string; createdAt: string; findings: { code: string }[] }[]) => void,
  ) => {
    state.onAnalyses = onData;
    onData([]);
    return state.stopFeedback;
  },
  subscribeToEquipmentHistory: (
    _db: unknown,
    _uid: unknown,
    _athlete: unknown,
    onData: (rows: { id: string; createdAt: string; findings?: { code: string }[] }[]) => void,
  ) => {
    state.onEquipment = onData;
    onData([]);
    return state.stopFeedback;
  },
}));

// A Wednesday: 2026-10-26 is the Monday of the week, so Monday and Tuesday are past and Thursday on is later.
const WEDNESDAY = new Date(2026, 9, 28, 12, 0, 0);
const SUNDAY = new Date(2026, 10, 1, 12, 0, 0);

beforeEach(() => {
  // Here and not in afterEach: the previous page is unmounted by the library's own afterEach, which
  // can run after ours and would count its stop into this test.
  state.stopHistory.mockClear();
  state.historySubscriptions = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
  state.locale = "zh";
  state.uid = "user-1";
  state.db = {};
  state.training.value = null;
  state.training.loading = false;
  state.training.error = null;
  state.setPlanFocus.mockClear();
  state.setPlanFocusFails = false;
  state.onAnalyses = null;
  state.onEquipment = null;
  state.history = null;
  state.stopFeedback.mockClear();
  sessionStorage.clear();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <TrainingPlanPage />
    </MemoryRouter>,
  );

const plan = (id: string, completed: boolean): Row => ({ id, text: id, completed, source: "plan" });
const manual = (id: string, completed: boolean): Row => ({ id, text: id, completed, source: "manual" });

/** A week with the lean focus chosen, rolled over today, with these tasks on today's list. */
function leanWeek(todayTasks: Row[], over: Record<string, unknown> = {}) {
  return {
    planFocus: "lean",
    planFocusWeek: "2026-10-26",
    planGeneratedDate: "2026-10-28",
    lastLoginDate: "2026-10-28",
    todayTasks,
    ...over,
  };
}

/** The seven day cards, in week order. */
const cards = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("ul > li")];
const MON = 0;
const TUE = 1;
const WED = 2;
const THU = 3;
const SUN = 6;

describe("training plan page", () => {
  it("covers every client day card with copy, and stores none of the card text", () => {
    expect(Object.keys(PLAN_DAY_COPY).sort()).toEqual(PLAN_DAYS.map((day) => day.id).sort());
  });

  it("waits for a focus, then shows seven cards with no check-in, no points and no balance", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const view = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Junior D 阶段训练模板");
    expect(screen.getByText(/请在左侧选择本周训练侧重/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /技术基础与弯道控制/ }));
    expect(state.setPlanFocus).toHaveBeenCalledWith({ db: {}, userId: "user-1", athleteId: "lindsay" }, "lean");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("第 1 周周期微循环：技术基础与弯道控制");
    expect(cards(view.container)).toHaveLength(7);

    // Nothing on the page writes points: the only buttons are the three focuses.
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toHaveLength(3);
    expect(view.container.textContent).not.toMatch(/打卡同步|取消打卡|完美打卡|积分/);
    expect(legacyColourClasses(view.container)).toEqual([]);
    expect(view.container.textContent).not.toContain("/analysis/planning");
  });

  it("has no check-in code left in the page", () => {
    expect(planPageSource).not.toMatch(/CheckIn|pendingId|failedId|useGamification|weeklyCheckedPoints/);
  });

  it("keeps a focus chosen this week after a reload, with no click", () => {
    setTraining({ planFocus: "bounce", planFocusWeek: thisMonday(), todayTasks: [] });
    renderPage();
    expect(screen.getByRole("button", { name: /速度窗口与500m配速/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not call a state that has not arrived 'nothing chosen'", () => {
    state.training.loading = true;
    renderPage();
    expect(screen.getByText("正在读取本周侧重…")).toBeTruthy();
    expect(screen.queryByText(/请在左侧选择本周训练侧重/)).toBeNull();
  });

  it("asks to confirm a focus from an earlier week, and shows no week until it is confirmed", async () => {
    setTraining({ planFocus: "lean", planFocusWeek: "2020-01-06", todayTasks: [] });
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const view = renderPage();
    expect(screen.getByText(/之前选的侧重是「技术基础与弯道控制」，本周还没有确认/)).toBeTruthy();
    expect(cards(view.container)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "本周沿用" }));
    expect(state.setPlanFocus).toHaveBeenCalledWith({ db: {}, userId: "user-1", athleteId: "lindsay" }, "lean");
    expect(cards(view.container)).toHaveLength(7);
    expect(screen.queryByText(/本周还没有确认/)).toBeNull();
  });

  it("says the focus was not saved, and does not show the week as chosen", async () => {
    state.setPlanFocusFails = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const view = renderPage();
    await user.click(screen.getByRole("button", { name: /技术基础与弯道控制/ }));
    expect(await screen.findByText("侧重没有保存成功，请再试一次。")).toBeTruthy();
    expect(cards(view.container)).toHaveLength(0);
    error.mockRestore();
  });

  it("uses the English draft when the locale is English", () => {
    state.locale = "en";
    setTraining(leanWeek([plan("a", true), plan("b", false)]));
    const view = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Junior D training template");
    expect(screen.queryByRole("region", { name: "Suggestions from analysis" })).toBeNull();
    expect(within(cards(view.container)[WED]!).getByText("1 of 2 done")).toBeTruthy();
    expect(within(cards(view.container)[TUE]!).getByText("Loading…")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open today's tasks" }).getAttribute("href")).toBe("/training/tasks");
    expect(screen.getByText(/counts every task of the day, including tasks you added and Academy tasks/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Check in/ })).toBeNull();
  });
});

describe("plan progress, today", () => {
  it("follows the task list: ticking a task on the tasks page moves the count here", () => {
    setTraining(leanWeek([plan("a", false), plan("b", false), plan("c", false)]));
    const view = renderPage();
    const today = () => cards(view.container)[WED]!;
    expect(within(today()).getByText("已完成 0 / 3")).toBeTruthy();

    setTraining(leanWeek([plan("a", true), plan("b", false), plan("c", false)]));
    expect(within(today()).getByText("已完成 1 / 3")).toBeTruthy();

    setTraining(leanWeek([plan("a", true), plan("b", true), plan("c", true)]));
    expect(within(today()).getByText("全部完成（3 / 3）")).toBeTruthy();

    setTraining(leanWeek([plan("a", true), plan("b", true), plan("c", false)]));
    expect(within(today()).getByText("已完成 2 / 3")).toBeTruthy();
  });

  it("counts only plan tasks, not the ones the user added", () => {
    setTraining(leanWeek([plan("a", true), manual("m1", true), manual("m2", false)]));
    const view = renderPage();
    expect(within(cards(view.container)[WED]!).getByText("全部完成（1 / 1）")).toBeTruthy();
  });

  it("says 'not generated' before anything was generated", () => {
    setTraining(leanWeek([manual("m", false)], { planGeneratedDate: undefined }));
    const view = renderPage();
    expect(within(cards(view.container)[WED]!).getByText("未生成")).toBeTruthy();
  });

  it("says 'generated, then cleared' when every plan task was deleted", () => {
    setTraining(leanWeek([manual("m", false)]));
    const view = renderPage();
    expect(within(cards(view.container)[WED]!).getByText("已生成，已被清空")).toBeTruthy();
  });

  it("does not show yesterday's list as today's before the day has rolled over", () => {
    setTraining(leanWeek([plan("a", true)], { lastLoginDate: "2026-10-27", planGeneratedDate: "2026-10-27" }));
    const view = renderPage();
    expect(within(cards(view.container)[WED]!).getByText("未生成")).toBeTruthy();
  });

  it("says it is loading, and that it could not be read, instead of showing an empty day", () => {
    state.training.loading = true;
    state.training.value = null;
    const view = renderPage();
    // No focus yet while loading, so there are no cards: the focus line says so.
    expect(cards(view.container)).toHaveLength(0);
    expect(screen.getByText("正在读取本周侧重…")).toBeTruthy();

    state.training.loading = false;
    state.training.error = "permission-denied";
    setTraining(leanWeek([plan("a", true)]));
    expect(within(cards(view.container)[WED]!).getByText("没有读出来")).toBeTruthy();
    expect(screen.getByText("今天的任务没有读出来，今日完成度暂时不可用。")).toBeTruthy();
  });

  it("marks today's card", () => {
    setTraining(leanWeek([]));
    const view = renderPage();
    expect(cards(view.container).map((card) => card.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "date",
      null,
      null,
      null,
      null,
    ]);
    expect(within(cards(view.container)[WED]!).getByText(/10月28日.*今天|今天/)).toBeTruthy();
  });
});

describe("plan progress, past days", () => {
  it("reads Monday to yesterday from the day archive, and releases it with the page", () => {
    setTraining(leanWeek([]));
    const view = renderPage();
    expect(state.history?.args).toEqual([{}, "user-1", "lindsay", "2026-10-26", "2026-10-27"]);
    view.unmount();
    // Every read that was opened has been closed (a development double mount opens two).
    expect(state.historySubscriptions).toBeGreaterThan(0);
    expect(state.stopHistory).toHaveBeenCalledTimes(state.historySubscriptions);
  });

  it("shows loading until the archive arrives, then the count for a day that has one and 'no record' for one that has not", () => {
    setTraining(leanWeek([]));
    const view = renderPage();
    expect(within(cards(view.container)[MON]!).getByText("正在读取…")).toBeTruthy();
    expect(within(cards(view.container)[TUE]!).getByText("正在读取…")).toBeTruthy();

    act(() => {
      state.history?.onDays([
        { dateId: "2026-10-26", tasks: [plan("a", true), plan("b", false), manual("m", true)] },
      ]);
    });
    expect(within(cards(view.container)[MON]!).getByText("已完成 1 / 2")).toBeTruthy();
    expect(within(cards(view.container)[TUE]!).getByText("无记录")).toBeTruthy();
    expect(within(cards(view.container)[TUE]!).queryByText(/未完成/)).toBeNull();
  });

  it("says a past day was complete when every plan task in its archive was done", () => {
    setTraining(leanWeek([]));
    const view = renderPage();
    act(() => {
      state.history?.onDays([{ dateId: "2026-10-27", tasks: [plan("a", true), plan("b", true)] }]);
    });
    expect(within(cards(view.container)[TUE]!).getByText("全部完成（2 / 2）")).toBeTruthy();
  });

  it("says an archived day had no plan tasks, when it had only other tasks", () => {
    setTraining(leanWeek([]));
    const view = renderPage();
    act(() => {
      state.history?.onDays([{ dateId: "2026-10-26", tasks: [manual("m", true)] }]);
    });
    expect(within(cards(view.container)[MON]!).getByText("当天没有计划任务")).toBeTruthy();
  });

  it("does not turn a failed read into 'no record'", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setTraining(leanWeek([]));
    const view = renderPage();
    act(() => {
      state.history?.onError(Object.assign(new Error("denied"), { code: "permission-denied" }));
    });
    expect(within(cards(view.container)[MON]!).getByText("没有读出来")).toBeTruthy();
    expect(within(cards(view.container)[MON]!).queryByText("无记录")).toBeNull();
    expect(screen.getByText(/本周前几天的记录没有读出来/)).toBeTruthy();
    // Today still comes from the live state.
    expect(within(cards(view.container)[WED]!).getByText("已生成，已被清空")).toBeTruthy();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("reads nothing on a Monday, because no day of the week has passed", () => {
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0, 0));
    setTraining(leanWeek([plan("a", false)], { lastLoginDate: "2026-10-26", planGeneratedDate: "2026-10-26" }));
    const view = renderPage();
    expect(state.history).toBeNull();
    expect(within(cards(view.container)[MON]!).getByText("已完成 0 / 1")).toBeTruthy();
  });
});

describe("plan progress, later days and rest days", () => {
  it("shows only the schedule for later days, with no progress line", () => {
    setTraining(leanWeek([plan("a", true)]));
    const view = renderPage();
    for (const index of [THU, 4, 5, SUN]) {
      const card = cards(view.container)[index]!;
      expect(card.querySelector("[data-progress]")).toBeNull();
      expect(card.textContent).toMatch(/强度：/);
    }
    expect(cards(view.container)[THU]!.querySelector("[data-progress]")).toBeNull();
  });

  it("says a rest day lays no tasks when it is today, and not 'cleared' or 'no record'", () => {
    vi.setSystemTime(SUNDAY);
    setTraining(leanWeek([], { lastLoginDate: "2026-11-01", planGeneratedDate: "2026-11-01" }));
    const view = renderPage();
    expect(within(cards(view.container)[SUN]!).getByText("休息日，不生成任务")).toBeTruthy();
    expect(within(cards(view.container)[SUN]!).queryByText("已生成，已被清空")).toBeNull();
    expect(state.history?.args.slice(3)).toEqual(["2026-10-26", "2026-10-31"]);
  });
});

describe("plan page notes", () => {
  it("says the full-attendance bonus counts every task of the day, not only the plan", () => {
    setTraining(leanWeek([]));
    renderPage();
    expect(
      screen.getByText(
        "全勤奖按当天全部任务计算，包括手动添加和学院任务，不是只看计划任务。做完计划任务不一定有全勤奖。",
      ),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "打开今日任务" });
    expect(link.getAttribute("href")).toBe("/training/tasks");
    expect(link.className).toContain("min-h-11");
  });
});

describe("plan suggestions", () => {
  it("adopts a pace suggestion by selecting that focus, and does not write", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();
    act(() => {
      state.onAnalyses?.([
        {
          kind: "pace",
          id: "pace-1",
          createdAt: "2026-10-20T12:00:00.000Z",
          findings: [{ code: "pace.decay.back-half" }],
        },
      ]);
    });
    expect(screen.getByText("将本周侧重设为『速度窗口与500m配速』")).toBeTruthy();
    expect(screen.getByText(/来自配速分析 pace-1/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "采纳" }));

    expect(screen.getByRole("button", { name: /速度窗口与500m配速/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: /第 1 周周期微循环：速度窗口与500m配速/ })).toBeTruthy();
  });

  it("hides an ignored suggestion for this session and does not write", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();
    act(() => {
      state.onAnalyses?.([
        {
          kind: "biomech",
          id: "bio-1",
          createdAt: "2026-10-18T12:00:00.000Z",
          findings: [{ code: "biomech.knee.high" }],
        },
      ]);
    });
    await user.click(screen.getByRole("button", { name: "忽略" }));

    expect(screen.queryByText("将本周侧重设为『技术基础与弯道控制』")).toBeNull();
    expect(sessionStorage.getItem("skatingx.plan.feedback.hidden")).toContain("bio-1");

    act(() => {
      state.onAnalyses?.([
        {
          kind: "biomech",
          id: "bio-2",
          createdAt: "2026-10-20T12:00:00.000Z",
          findings: [{ code: "biomech.lean.high" }],
        },
      ]);
    });
    expect(screen.getByText("将本周侧重设为『技术基础与弯道控制』")).toBeTruthy();
    expect(screen.getByText(/来自生物力学分析 bio-2/)).toBeTruthy();
  });

  it("links an equipment symptom to the equipment page and does not change the plan", () => {
    renderPage();
    act(() => {
      state.onEquipment?.([
        {
          id: "equip-1",
          createdAt: "2026-10-20T12:00:00.000Z",
          findings: [{ code: "equipment.symptom.slide" }],
        },
      ]);
    });

    const link = screen.getByRole("link", { name: "打开器材页" });
    expect(link.getAttribute("href")).toBe("/analysis/equipment");
    expect(screen.queryByRole("button", { name: "采纳" })).toBeNull();
    expect(screen.getByRole("button", { name: /技术基础与弯道控制/ }).getAttribute("aria-pressed")).toBe("false");
  });
});
