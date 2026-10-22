// @vitest-environment happy-dom
import { PLAN_DAYS } from "@skatingx/skating-domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { TrainingPlanPage } from "@/pages/training/TrainingPlanPage";
import { act, render, screen, userEvent } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

import { PLAN_DAY_COPY } from "./plan-day-copy";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: "user-1" as string | null,
  db: {} as object | null,
  points: 120,
  checkIns: [] as { taskId: string; points: number }[],
  onData: null as ((rows: { taskId: string; points: number }[]) => void) | null,
  onAnalyses: null as
    | ((rows: { kind: "pace" | "biomech"; id: string; createdAt: string; findings: { code: string }[] }[]) => void)
    | null,
  onEquipment: null as ((rows: { id: string; createdAt: string; findings?: { code: string }[] }[]) => void) | null,
  unsubscribe: vi.fn(),
  stopFeedback: vi.fn(),
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

afterEach(() => {
  state.locale = "zh";
  state.uid = "user-1";
  state.db = {};
  state.points = 120;
  state.checkIns = [];
  state.onData = null;
  state.onAnalyses = null;
  state.onEquipment = null;
  state.unsubscribe.mockClear();
  state.stopFeedback.mockClear();
  state.complete.mockClear();
  sessionStorage.clear();
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
    expect(sessionStorage.getItem("skatingx.plan.focus")).toBe("lean");
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
    expect(screen.queryByRole("region", { name: "Suggestions from analysis" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Check in" })).toHaveLength(7);
    expect(screen.queryByText(/Loading the engine/)).toBeNull();
    expect(screen.getByText(/Points checked in this week:/).textContent).toContain("0");
  });

  it("adopts a pace suggestion by selecting that focus, and does not write", async () => {
    const user = userEvent.setup();
    render(<TrainingPlanPage />);
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
    expect(state.complete).not.toHaveBeenCalled();
  });

  it("hides an ignored suggestion for this session and does not write", async () => {
    const user = userEvent.setup();
    render(<TrainingPlanPage />);
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
    expect(state.complete).not.toHaveBeenCalled();
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
    render(
      <MemoryRouter>
        <TrainingPlanPage />
      </MemoryRouter>,
    );
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
    expect(state.complete).not.toHaveBeenCalled();
  });
});
