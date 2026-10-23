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
}));

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
});
