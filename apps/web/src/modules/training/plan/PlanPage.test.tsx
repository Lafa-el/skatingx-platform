// @vitest-environment happy-dom
import { PLAN_DAYS } from "@skatingx/skating-domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrainingPlanPage } from "@/pages/training/TrainingPlanPage";
import { render, screen, userEvent } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

import { PLAN_DAY_COPY } from "./plan-day-copy";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: "user-1" as string | null,
  db: {} as object | null,
  points: 120,
  checkIns: [] as { taskId: string; points: number }[],
  onData: null as ((rows: { taskId: string; points: number }[]) => void) | null,
  unsubscribe: vi.fn(),
  complete: vi.fn(
    (_db: unknown, _uid: unknown, _athlete: unknown, _taskId: string) => Promise.resolve("saved" as const),
  ),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: false, firebaseReady: Boolean(state.uid) }),
}));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useGamification: () => ({
    data: { points: state.points, streakDays: 0, completedDays: [] },
    loading: false,
    error: null,
  }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  subscribeToPlanningCheckIns: (
    _db: unknown,
    _uid: unknown,
    _athlete: unknown,
    onData: (rows: { taskId: string; points: number }[]) => void,
  ) => {
    state.onData = onData;
    onData(state.checkIns);
    return state.unsubscribe;
  },
  completePlanningCheckIn: (db: unknown, uid: unknown, athlete: unknown, taskId: string) =>
    state.complete(db, uid, athlete, taskId),
}));

afterEach(() => {
  state.locale = "zh";
  state.uid = "user-1";
  state.db = {};
  state.points = 120;
  state.checkIns = [];
  state.onData = null;
  state.unsubscribe.mockClear();
  state.complete.mockClear();
});

describe("training plan page", () => {
  it("covers every client day card with copy, and stores none of the card text", () => {
    expect(Object.keys(PLAN_DAY_COPY).sort()).toEqual(PLAN_DAYS.map((day) => day.id).sort());
  });

  it("waits for a focus, then shows seven cards and the weekly total", async () => {
    const user = userEvent.setup();
    const view = render(<TrainingPlanPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Junior D 阶段训练模板");
    expect(screen.getByText(/请在左侧选择本周训练侧重/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "打卡同步" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /技术基础与弯道控制/ }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("第 1 周周期微循环：技术基础与弯道控制");
    expect(screen.getAllByRole("button", { name: "打卡同步" })).toHaveLength(7);
    expect(screen.getByText(/本周已打卡积分：/)).toBeTruthy();
    expect(screen.getByText(/本周已打卡积分：/).textContent).toContain("0");
    expect(screen.getByText("积分 120")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "打卡同步" })[0]?.className).toContain("min-h-11");
    expect(legacyColourClasses(view.container)).toEqual([]);
    expect(view.container.textContent).not.toContain("/analysis/planning");

    view.unmount();
    expect(state.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("checks a day in, adds that day's points to the week, and moves the training balance", async () => {
    state.complete.mockImplementation(async () => {
      state.points = 150;
      state.checkIns = [{ taskId: "jd_tech_mon", points: 30 }];
      state.onData?.(state.checkIns);
      return "saved";
    });
    const user = userEvent.setup();
    render(<TrainingPlanPage />);
    await user.click(screen.getByRole("button", { name: /技术基础与弯道控制/ }));
    await user.click(screen.getAllByRole("button", { name: "打卡同步" })[0]!);

    expect(state.complete).toHaveBeenCalledWith({}, "user-1", "lindsay", "jd_tech_mon");
    expect(screen.getByRole("button", { name: "完美打卡（已同步）" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "打卡同步" })).toHaveLength(6);
    expect(screen.getByText(/本周已打卡积分：/).textContent).toContain("30");
    expect(screen.getByText("积分 150")).toBeTruthy();
  });

  it("uses the English draft when the locale is English", async () => {
    state.locale = "en";
    const user = userEvent.setup();
    render(<TrainingPlanPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Junior D training template");
    await user.click(screen.getByRole("button", { name: /Technique and corner control/ }));
    expect(screen.getAllByRole("button", { name: "Check in" })).toHaveLength(7);
    expect(screen.queryByText(/Warming the model/)).toBeNull();
    expect(screen.getByText(/Points checked in this week:/).textContent).toContain("0");
  });
});
