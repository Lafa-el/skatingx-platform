// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";

import { TrainingHistoryPage } from "./TrainingHistoryPage";

const october = [
  {
    dateId: "2026-10-02",
    tasks: [{ id: "early", text: "Easy skate", completed: true }],
  },
  {
    dateId: "2026-10-19",
    tasks: [
      { id: "a", text: "400m", completed: true },
      { id: "b", text: "Lunges", completed: false },
    ],
  },
];

const state = vi.hoisted(() => ({
  allowPin: true,
  action: "",
  confirmResult: true,
  confirmMessage: "",
  confirmCalls: 0,
  deleteDay: vi.fn(async (..._args: unknown[]) => undefined),
  updateGamification: vi.fn((..._args: unknown[]) => undefined),
  mode: "ready" as "ready" | "error" | "loading" | "error-then-ready",
  user: { uid: "user-1" } as { uid: string } | null,
  subscribeCalls: [] as { start: string; end: string }[],
  ledger: { points: 40, streakDays: 5, completedDays: ["2026-10-19"] },
  db: { kind: "db" },
  ledgerTotal: 40,
  ledgerOpening: 0,
  octoberLedger: [] as {
    id: string;
    dateId: string;
    delta: number;
    reason: string;
    refId?: string;
    createdAt: string;
  }[],
  septemberLedger: [] as {
    id: string;
    dateId: string;
    delta: number;
    reason: string;
    refId?: string;
    createdAt: string;
  }[],
  ledgerMode: "ready" as "ready" | "loading" | "error" | "error-then-ready",
  ledgerAttempt: 0,
  ledgerMonthReads: [] as string[],
}));

vi.mock("@skatingx/schema", async () => {
  const actual = await vi.importActual<typeof import("@skatingx/schema")>("@skatingx/schema");
  return { ...actual, todayDateString: () => "2026-10-23" };
});

vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ user: state.user, loading: false }),
}));

vi.mock("@/app/providers/FirestoreProvider", () => ({
  useActiveAthlete: () => ({ athleteId: "lindsay", loading: false, error: null, profile: { data: null, loading: false, error: null } }),
  useGamification: () => ({ data: state.ledger, loading: false, error: null }),
}));

vi.mock("@/hooks/useLocale", () => ({
  useLocale: () => "zh",
}));

vi.mock("@/hooks/useParentPinGuard", () => ({
  useParentPinGuard: () => ({
    configured: true,
    dialog: null,
    guard: (action: string, run: () => void) => {
      state.action = action;
      if (state.allowPin) run();
    },
  }),
}));

vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  subscribeToTaskHistoryMonth: (
    _db: unknown,
    _uid: string,
    _athleteId: string,
    start: string,
    end: string,
    onDays: (days: readonly { dateId: string; tasks: readonly { id: string; text: string; completed: boolean }[] }[]) => void,
    onError: (error: unknown) => void,
  ) => {
    state.subscribeCalls.push({ start, end });
    if (state.mode === "loading") return () => {};
    if (state.mode === "error" || (state.mode === "error-then-ready" && state.subscribeCalls.length === 1)) {
      onError(new Error("read failed"));
      return () => {};
    }
    onDays(start.startsWith("2026-09") ? [] : october);
    return () => {};
  },
  deleteTaskHistoryDay: (...args: unknown[]) => state.deleteDay(...args),
  updateGamification: (...args: unknown[]) => state.updateGamification(...args),
  readPointsLedgerTotal: () => ledgerResult(state.ledgerTotal),
  readPointsLedgerOpening: () => ledgerResult(state.ledgerOpening),
  readPointsLedgerMonth: (_db: unknown, _uid: string, _athleteId: string, start: string) => {
    state.ledgerMonthReads.push(start);
    return ledgerResult(start.startsWith("2026-09") ? state.septemberLedger : state.octoberLedger);
  },
}));

function ledgerResult<T>(value: T): Promise<T> {
  if (state.ledgerMode === "loading") return new Promise(() => undefined);
  if (state.ledgerMode === "error") return Promise.reject(new Error("ledger failed"));
  if (state.ledgerMode === "error-then-ready") {
    state.ledgerAttempt += 1;
    if (state.ledgerAttempt <= 3) return Promise.reject(new Error("ledger failed"));
  }
  return Promise.resolve(value);
}

describe("TrainingHistoryPage", () => {
  afterEach(() => {
    state.allowPin = true;
    state.action = "";
    state.confirmResult = true;
    state.confirmMessage = "";
    state.confirmCalls = 0;
    state.mode = "ready";
    state.user = { uid: "user-1" };
    state.subscribeCalls = [];
    state.ledger = { points: 40, streakDays: 5, completedDays: ["2026-10-19"] };
    state.ledgerTotal = 40;
    state.ledgerOpening = 0;
    state.octoberLedger = [];
    state.septemberLedger = [];
    state.ledgerMode = "ready";
    state.ledgerAttempt = 0;
    state.ledgerMonthReads = [];
    state.deleteDay.mockClear();
    state.updateGamification.mockClear();
    vi.unstubAllGlobals();
  });

  function stubConfirm(): void {
    vi.stubGlobal("confirm", (message: string) => {
      state.confirmCalls += 1;
      state.confirmMessage = message;
      return state.confirmResult;
    });
  }

  it("opens on the latest archived day and will not move past the current month", async () => {
    render(<TrainingHistoryPage />);
    expect(await screen.findByText("完成 1/2")).toBeTruthy();
    expect(screen.getByText("400m")).toBeTruthy();
    expect(screen.getByText("Lunges")).toBeTruthy();
    expect(screen.getByText("已完成")).toBeTruthy();
    expect(screen.getByText("未完成")).toBeTruthy();
    expect(screen.getByText("圆点是有归档的日子，焰橙色是全勤日。")).toBeTruthy();
    const archived = screen.getByRole("button", { name: /10月19日/ });
    expect(archived.className).toContain("bg-brand-flame");
    expect(archived.querySelector("span.rounded-full")).toBeTruthy();
    expect(screen.getByRole("button", { name: /10月23日/ }).className).toContain("ring-brand-navy");
    expect(screen.getByRole("button", { name: "下个月" }).hasAttribute("disabled")).toBe(true);
    expect(state.subscribeCalls[0]).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });

  it("shows an empty calendar and the empty day, not an error, when the month has no archive", async () => {
    const user = userEvent.setup();
    render(<TrainingHistoryPage />);
    await screen.findByText("完成 1/2");
    await user.click(screen.getByRole("button", { name: "上个月" }));
    expect(await screen.findByText("这一天没有归档的任务。")).toBeTruthy();
    expect(screen.queryByText("这次没有读出这个月的记录。")).toBeNull();
    expect(screen.queryByRole("button", { name: "删除这天的记录" })).toBeNull();
    expect(state.subscribeCalls.at(-1)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(screen.getByRole("button", { name: /9月1日/ })).toBeTruthy();
  });

  it("shows a read failure inside the calendar, and retry loads the month", async () => {
    state.mode = "error-then-ready";
    const user = userEvent.setup();
    render(<TrainingHistoryPage />);
    expect(await screen.findByText("这次没有读出这个月的记录。")).toBeTruthy();
    expect(screen.queryByText("这一天没有归档的任务。")).toBeNull();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("完成 1/2")).toBeTruthy();
  });

  it("keeps the skeleton while the month is loading", () => {
    state.mode = "loading";
    render(<TrainingHistoryPage />);
    expect(screen.getByText("正在读取这个月的记录。")).toBeTruthy();
    expect(screen.queryByText("这一天没有归档的任务。")).toBeNull();
  });

  it("does not delete when the PIN gate does not let the action through", async () => {
    state.allowPin = false;
    stubConfirm();
    const user = userEvent.setup();
    render(<TrainingHistoryPage />);
    await screen.findByText("完成 1/2");
    await user.click(screen.getByRole("button", { name: "删除这天的记录" }));
    expect(state.action).toBe("deleteTaskHistory");
    expect(state.confirmCalls).toBe(0);
    expect(state.deleteDay).not.toHaveBeenCalled();
    expect(state.updateGamification).not.toHaveBeenCalled();
    expect(state.ledger).toEqual({ points: 40, streakDays: 5, completedDays: ["2026-10-19"] });
  });

  it("does not delete when the confirmation is cancelled", async () => {
    state.confirmResult = false;
    stubConfirm();
    const user = userEvent.setup();
    render(<TrainingHistoryPage />);
    await screen.findByText("完成 1/2");
    await user.click(screen.getByRole("button", { name: "删除这天的记录" }));
    expect(state.confirmCalls).toBe(1);
    expect(state.deleteDay).not.toHaveBeenCalled();
    expect(state.ledger.points).toBe(40);
    expect(state.ledger.streakDays).toBe(5);
    expect(state.ledger.completedDays).toEqual(["2026-10-19"]);
  });

  it("deletes only that day's archive after the PIN gate and the confirmation", async () => {
    stubConfirm();
    const user = userEvent.setup();
    const ledger = state.ledger;
    render(<TrainingHistoryPage />);
    await screen.findByText("完成 1/2");
    await user.click(screen.getByRole("button", { name: "删除这天的记录" }));
    expect(state.action).toBe("deleteTaskHistory");
    expect(state.confirmMessage).toContain("删除后不可恢复");
    expect(state.confirmMessage).toContain("按当前费率收回");
    expect(state.confirmMessage).toContain("会重算");
    expect(state.deleteDay).toHaveBeenCalledTimes(1);
    expect(state.deleteDay.mock.calls[0]).toEqual([state.db, "user-1", "lindsay", "2026-10-19"]);
    expect(state.updateGamification).not.toHaveBeenCalled();
    expect(state.ledger).toBe(ledger);
    expect(ledger).toEqual({ points: 40, streakDays: 5, completedDays: ["2026-10-19"] });
  });

  it("reads the ledger only after the detail view opens, and the month change follows the calendar", async () => {
    state.ledgerTotal = 180;
    state.ledgerOpening = 80;
    state.ledger.points = 180;
    state.octoberLedger = [
      { id: "task", dateId: "2026-10-19", delta: 20, reason: "task-complete", refId: "a", createdAt: "2026-10-19T01:00:00.000Z" },
      { id: "bonus", dateId: "2026-10-19", delta: 50, reason: "daily-bonus-add", createdAt: "2026-10-19T02:00:00.000Z" },
      { id: "plan", dateId: "2026-10-22", delta: 30, reason: "plan-checkin", refId: "jd_tech_mon", createdAt: "2026-10-22T03:00:00.000Z" },
      // Retired check-in events stay in the ledger and must keep naming focus and weekday (ADR-008 step 3).
      { id: "unplan", dateId: "2026-10-23", delta: -35, reason: "plan-uncheckin", refId: "jd_speed_wed", createdAt: "2026-10-23T03:00:00.000Z" },
    ];
    state.septemberLedger = [
      { id: "opening", dateId: "2026-09-02", delta: 80, reason: "opening-balance", createdAt: "2026-09-02T00:00:00.000Z" },
    ];
    const user = userEvent.setup();
    render(<TrainingHistoryPage />);
    await screen.findByText("完成 1/2");
    expect(state.ledgerMonthReads).toEqual([]);
    const subscriptions = state.subscribeCalls.length;

    await user.click(screen.getByRole("button", { name: "积分明细" }));
    expect(await screen.findByText("完成任务")).toBeTruthy();
    expect(screen.getByText("全勤奖励")).toBeTruthy();
    expect(screen.getByText("计划打卡（技术基础，周一）")).toBeTruthy();
    expect(screen.getByText("取消打卡（速度，周三）")).toBeTruthy();
    expect(screen.getByText("小计 +70")).toBeTruthy();
    expect(screen.getByText("小计 +30")).toBeTruthy();
    expect(screen.getByText(/小计 [-−]35/)).toBeTruthy();
    expect(screen.getByText("当前积分＝期初＋流水净额")).toBeTruthy();
    expect(screen.queryByText("未归属差额")).toBeNull();
    expect(screen.queryByText("期初余额（迁移带入）")).toBeNull();
    expect(screen.queryByText("400m")).toBeNull();
    expect(state.ledgerMonthReads).toEqual(["2026-10-01"]);
    expect(state.subscribeCalls.length).toBe(subscriptions);

    await user.click(screen.getByRole("button", { name: "上个月" }));
    expect(await screen.findByText("期初余额（迁移带入）")).toBeTruthy();
    expect(screen.queryByText("完成任务")).toBeNull();
    expect(state.ledgerMonthReads.at(-1)).toBe("2026-09-01");

    await user.click(screen.getByRole("button", { name: "日历" }));
    expect(await screen.findByText("这一天没有归档的任务。")).toBeTruthy();
    expect(state.subscribeCalls.length).toBe(subscriptions + 1);
  });

  it("shows an unattributed gap when the balance and the ledger sum differ", async () => {
    state.ledger.points = 100;
    state.ledgerTotal = 180;
    state.ledgerOpening = 80;
    const user = userEvent.setup();
    render(<TrainingHistoryPage />);
    await user.click(screen.getByRole("button", { name: "积分明细" }));
    expect(await screen.findByText("未归属差额 -80")).toBeTruthy();
    expect(screen.getByText("这个月没有积分流水。")).toBeTruthy();
  });

  it("keeps a ledger read failure inside the detail view, and retry loads it", async () => {
    state.ledgerMode = "error-then-ready";
    const user = userEvent.setup();
    render(<TrainingHistoryPage />);
    await screen.findByText("完成 1/2");
    await user.click(screen.getByRole("button", { name: "积分明细" }));
    expect(await screen.findByText("这次没有读出积分流水。")).toBeTruthy();
    expect(screen.queryByText("这次没有读出这个月的记录。")).toBeNull();
    expect(screen.queryByText("这个月没有积分流水。")).toBeNull();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("这个月没有积分流水。")).toBeTruthy();
  });

  it("shows the ledger skeleton while the month of events is loading", async () => {
    state.ledgerMode = "loading";
    const user = userEvent.setup();
    render(<TrainingHistoryPage />);
    await user.click(screen.getByRole("button", { name: "积分明细" }));
    expect(await screen.findByText("正在读取积分流水。")).toBeTruthy();
    expect(screen.queryByText("这个月没有积分流水。")).toBeNull();
  });
});
