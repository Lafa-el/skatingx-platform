// @vitest-environment happy-dom
import { getAcademyStages, getWeekdayRoutineItems } from "@skatingx/content";
import { afterEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@/test/dom";

import { useAcademyImport } from "./useAcademyImport";

const h = vi.hoisted(() => {
  const base = () => ({
    uid: "uid-1" as string | null,
    settings: { language: "zh", isPro: true, activeAthleteId: "athlete-9" } as Record<string, unknown> | null,
    db: {} as object | null,
  });
  return {
    base,
    state: base(),
    importAcademyTasks: vi.fn(async (_ctx: unknown, _candidates: unknown[]) => ({ imported: 2, skipped: 1 })),
  };
});

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.state.uid }) }));
vi.mock("@/app/providers/FirestoreProvider", () => ({ useUserSettings: () => ({ data: h.state.settings }) }));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => h.state.db,
  importAcademyTasks: h.importAcademyTasks,
}));

const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  logged.mockClear();
  h.state = h.base();
  h.importAcademyTasks.mockClear();
  h.importAcademyTasks.mockImplementation(async () => ({ imported: 2, skipped: 1 }));
});

const stage = getAcademyStages()[1] ?? getAcademyStages()[0]!;
const item = stage.modules[0]!.items[0]!;
const plan = stage.weeklyRoutine.dayPlans[0]!;

const candidatesOfLastCall = () => h.importAcademyTasks.mock.calls.at(-1)?.[1] as { text: string }[];

describe("useAcademyImport: language", () => {
  it("follows the settings and defaults to Chinese", () => {
    expect(renderHook(() => useAcademyImport()).result.current.language).toBe("zh");
    h.state.settings = { language: "en" };
    expect(renderHook(() => useAcademyImport()).result.current.language).toBe("en");
    h.state.settings = null;
    expect(renderHook(() => useAcademyImport()).result.current.language).toBe("zh");
  });

  it("imports a drill in the active language", async () => {
    const zh = renderHook(() => useAcademyImport());
    await act(() => zh.result.current.importItem(item));
    expect(candidatesOfLastCall()[0]?.text).toBe(item.titleZh);
    expect(h.importAcademyTasks.mock.calls.at(-1)?.[1]).toMatchObject([{ tags: item.tagsZh }]);

    h.state.settings = { language: "en", isPro: true };
    const en = renderHook(() => useAcademyImport());
    await act(() => en.result.current.importItem(item));
    expect(candidatesOfLastCall()[0]?.text).toBe(item.titleEn);
    // The tags are written in the same language as the title, never mixed with it.
    expect(h.importAcademyTasks.mock.calls.at(-1)?.[1]).toMatchObject([{ tags: item.tagsEn }]);
  });
});

describe("useAcademyImport: importing", () => {
  it("writes for the signed-in user and the active athlete, and keeps the result", async () => {
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importItem(item));
    expect(h.importAcademyTasks.mock.calls[0]?.[0]).toMatchObject({ userId: "uid-1", athleteId: "athlete-9" });
    expect(result.current.lastResult).toEqual({ imported: 2, skipped: 1 });
    expect(result.current.busy).toBe(false);
    expect(result.current.actionError).toBeNull();
  });

  it("without a chosen athlete it writes for the default one", async () => {
    h.state.settings = { language: "zh" };
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importItem(item));
    expect(h.importAcademyTasks.mock.calls[0]?.[0]).toMatchObject({ athleteId: "lindsay" });
  });

  it("clears the result and the error on request", async () => {
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importItem(item));
    act(() => result.current.clearLastResult());
    expect(result.current.lastResult).toBeNull();

    h.importAcademyTasks.mockRejectedValueOnce(new Error("Write failed"));
    await act(() => result.current.importItem(item));
    expect(result.current.actionError).toBe("Write failed");
    act(() => result.current.clearActionError());
    expect(result.current.actionError).toBeNull();
  });

  it("returns the result on success", async () => {
    const { result } = renderHook(() => useAcademyImport());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.importItem(item);
    });
    expect(returned).toEqual({ imported: 2, skipped: 1 });
  });
});

describe("useAcademyImport: nothing to write to", () => {
  it("not signed in: writes nothing, tells the user in their language, and does not throw", async () => {
    h.state.uid = null;
    const zh = renderHook(() => useAcademyImport());
    let returned: unknown = "unset";
    await act(async () => {
      returned = await zh.result.current.importItem(item);
    });
    expect(returned).toBeNull();
    expect(zh.result.current.actionError).toBe("登录状态还没准备好，请稍后再试。");
    expect(zh.result.current.busy).toBe(false);
    expect(h.importAcademyTasks).not.toHaveBeenCalled();

    h.state.settings = { language: "en" };
    const en = renderHook(() => useAcademyImport());
    await act(() => en.result.current.importItem(item));
    expect(en.result.current.actionError).toBe("Sign-in is not ready yet. Try again in a moment.");
  });

  it("database not available: same, with the service named as the owner decided （数据服务 in Chinese only）", async () => {
    h.state.db = null;
    const zh = renderHook(() => useAcademyImport());
    await act(() => zh.result.current.importItem(item));
    expect(zh.result.current.actionError).toBe("数据服务暂时不可用，请稍后再试。");

    h.state.settings = { language: "en" };
    const en = renderHook(() => useAcademyImport());
    await act(() => en.result.current.importItem(item));
    expect(en.result.current.actionError).toBe("Firestore is not available right now. Try again later.");
    expect(h.importAcademyTasks).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith("[academy-import] importItem failed", { code: "db-unavailable" });
  });

  it("the message follows the language if it changes afterwards", async () => {
    h.state.uid = null;
    const view = renderHook(() => useAcademyImport());
    await act(() => view.result.current.importItem(item));
    expect(view.result.current.actionError).toBe("登录状态还没准备好，请稍后再试。");
    h.state.settings = { language: "en" };
    view.rerender();
    expect(view.result.current.actionError).toBe("Sign-in is not ready yet. Try again in a moment.");
  });

  it("a later success clears the message", async () => {
    h.state.uid = null;
    const view = renderHook(() => useAcademyImport());
    await act(() => view.result.current.importItem(item));
    expect(view.result.current.actionError).not.toBeNull();
    h.state.uid = "uid-1";
    view.rerender();
    await act(() => view.result.current.importItem(item));
    expect(view.result.current.actionError).toBeNull();
  });

  it("leaves a developer-facing line with the operation and the code, never the message", async () => {
    h.state.uid = null;
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importItem(item));
    expect(logged).toHaveBeenCalledTimes(1);
    const [text, context] = logged.mock.calls[0] as [string, Record<string, unknown>];
    expect(text).toBe("[academy-import] importItem failed");
    expect(context).toEqual({ code: "not-signed-in" });
  });
});

describe("useAcademyImport: failures", () => {
  it("shows the message from the data layer as it arrived, returns null and does not throw", async () => {
    h.importAcademyTasks.mockRejectedValueOnce(new Error("permission-denied"));
    const { result } = renderHook(() => useAcademyImport());
    let returned: unknown = "unset";
    await act(async () => {
      returned = await result.current.importItem(item);
    });
    expect(returned).toBeNull();
    expect(result.current.actionError).toBe("permission-denied");
    expect(result.current.busy).toBe(false);
  });

  it("logs the error code only, because a message can carry document paths", async () => {
    h.importAcademyTasks.mockRejectedValueOnce(Object.assign(new Error("No access to users/uid-1/x"), { code: "permission-denied" }));
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importItem(item));
    expect(logged).toHaveBeenCalledWith("[academy-import] importItem failed", { code: "permission-denied" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("uid-1");
  });

  it("names the operation that failed: a whole day and a whole weekday as well as one item", async () => {
    const { result } = renderHook(() => useAcademyImport());
    h.importAcademyTasks.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.importDayPlan(stage, plan.id));
    h.importAcademyTasks.mockRejectedValueOnce(new Error("x"));
    await act(() => result.current.importWeekdayRoutine(stage, "tuesday"));
    expect(logged.mock.calls.map((c) => c[0])).toEqual([
      "[academy-import] importDayPlan failed",
      "[academy-import] importWeekdayRoutine failed",
    ]);
  });

  it("an error that is not an Error is a readable sentence in the language, and follows it", async () => {
    h.importAcademyTasks.mockRejectedValueOnce("boom");
    const view = renderHook(() => useAcademyImport());
    await act(() => view.result.current.importItem(item));
    expect(view.result.current.actionError).toBe("导入学院内容失败。");

    h.state.settings = { language: "en", isPro: true };
    view.rerender();
    expect(view.result.current.actionError).toBe("Academy import failed.");
  });

  it("a later success clears an earlier error", async () => {
    h.importAcademyTasks.mockRejectedValueOnce(new Error("first"));
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importItem(item));
    expect(result.current.actionError).toBe("first");
    await act(() => result.current.importItem(item));
    expect(result.current.actionError).toBeNull();
  });
});

describe("useAcademyImport: PRO plans", () => {
  it("a day plan needs PRO: nothing is written, the refusal is worded in the language, and it is not a failure to log", async () => {
    h.state.settings = { language: "zh", isPro: false };
    const zh = renderHook(() => useAcademyImport());
    let returned: unknown = "unset";
    await act(async () => {
      returned = await zh.result.current.importDayPlan(stage, plan.id);
    });
    expect(returned).toBeNull();
    expect(zh.result.current.actionError).toBe("高阶计划导入需要 PRO。");

    h.state.settings = { language: "en", isPro: false };
    const en = renderHook(() => useAcademyImport());
    await act(() => en.result.current.importDayPlan(stage, plan.id));
    expect(en.result.current.actionError).toBe("PRO is required for advanced routine import.");
    expect(h.importAcademyTasks).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("the PRO flag must be exactly true", async () => {
    h.state.settings = { language: "en", isPro: "yes" };
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importWeekdayRoutine(stage, "tuesday"));
    expect(result.current.actionError).toBe("PRO is required for advanced routine import.");
    expect(h.importAcademyTasks).not.toHaveBeenCalled();
  });

  it("with PRO, a day plan imports one task per label", async () => {
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importDayPlan(stage, plan.id));
    expect(candidatesOfLastCall()).toHaveLength(plan.taskLabelsZh.length);
  });

  it("a weekday routine imports one task per routine item", async () => {
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importWeekdayRoutine(stage, "tuesday"));
    expect(candidatesOfLastCall()).toHaveLength(getWeekdayRoutineItems(stage, "tuesday").length);
  });

  it("the PRO check can be skipped by the caller", async () => {
    h.state.settings = { language: "zh", isPro: false };
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importDayPlan(stage, plan.id, false));
    expect(h.importAcademyTasks).toHaveBeenCalledTimes(1);
  });

  it("an unknown day plan is reported to the user and refused before anything is written", async () => {
    const zh = renderHook(() => useAcademyImport());
    await act(() => zh.result.current.importDayPlan(stage, "no-such-plan"));
    expect(zh.result.current.actionError).toBe("没有找到这个日计划。");
    expect(h.importAcademyTasks).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith("[academy-import] importDayPlan failed", { code: "plan-not-found" });

    h.state.settings = { language: "en", isPro: true };
    const en = renderHook(() => useAcademyImport());
    await act(() => en.result.current.importDayPlan(stage, "no-such-plan"));
    expect(en.result.current.actionError).toBe("That day plan was not found.");
  });
});

describe("useAcademyImport: a routine label that matches no drill", () => {
  // The shipped content matches every label, so this path only runs if the content changes.
  // Both languages are pinned now so that an addition cannot make English mode write Chinese.
  const unmatched = {
    ...stage,
    weeklyRoutine: {
      ...stage.weeklyRoutine,
      days: {
        ...stage.weeklyRoutine.days,
        tuesday: [{ routineItemId: "x-w9-t0", taskLabelZh: "Qxz动作 3组", taskLabelEn: "Qxz Move 3 sets" }],
      },
      dayPlans: [
        {
          ...plan,
          id: "x-wp-9",
          weekday: "tuesday" as const,
          taskLabelsZh: ["Qxz动作 3组"],
          taskLabelsEn: ["Qxz Move 3 sets"],
        },
      ],
    },
  };
  const lastCandidates = () => h.importAcademyTasks.mock.calls.at(-1)?.[1] as unknown[];

  it("Chinese: the name and the target are split at the last space, as before", async () => {
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importDayPlan(unmatched, "x-wp-9"));
    expect(lastCandidates()).toEqual([
      { academyItemId: "plan-fallback-x-wp-9-Qxz动作", text: "Qxz动作", target: "3组", tags: ["academy-routine"] },
    ]);
    await act(() => result.current.importWeekdayRoutine(unmatched, "tuesday"));
    expect(lastCandidates()).toEqual([
      { academyItemId: "routine-fallback-x-w9-t0", text: "Qxz动作", target: "3组", tags: ["academy-routine"] },
    ]);
  });

  it("English: the whole English label is the task text, not split at a space", async () => {
    h.state.settings = { language: "en", isPro: true };
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importDayPlan(unmatched, "x-wp-9"));
    expect(lastCandidates()).toEqual([
      { academyItemId: "plan-fallback-x-wp-9-Qxz动作", text: "Qxz Move 3 sets", tags: ["academy-routine"] },
    ]);
    await act(() => result.current.importWeekdayRoutine(unmatched, "tuesday"));
    expect(lastCandidates()).toEqual([
      { academyItemId: "routine-fallback-x-w9-t0", text: "Qxz Move 3 sets", tags: ["academy-routine"] },
    ]);
  });

  it("the id does not depend on the language, so 'already added today' still works after switching", async () => {
    const zh = renderHook(() => useAcademyImport());
    await act(() => zh.result.current.importDayPlan(unmatched, "x-wp-9"));
    const zhId = (lastCandidates()[0] as { academyItemId: string }).academyItemId;
    h.state.settings = { language: "en", isPro: true };
    const en = renderHook(() => useAcademyImport());
    await act(() => en.result.current.importDayPlan(unmatched, "x-wp-9"));
    expect((lastCandidates()[0] as { academyItemId: string }).academyItemId).toBe(zhId);
  });
});

describe("useAcademyImport: matching a routine label to a drill", () => {
  const drill = stage.modules[0]!.items[0]!;
  // The English label matches nothing; only the Chinese one names the drill.
  const only = {
    ...stage,
    weeklyRoutine: {
      ...stage.weeklyRoutine,
      days: {
        ...stage.weeklyRoutine.days,
        tuesday: [{ routineItemId: "y-w9-t0", taskLabelZh: drill.titleZh, taskLabelEn: "Qxz Move 3 sets" }],
      },
      dayPlans: [
        {
          ...plan,
          id: "y-wp-9",
          weekday: "tuesday" as const,
          taskLabelsZh: [drill.titleZh],
          taskLabelsEn: ["Qxz Move 3 sets"],
        },
      ],
    },
  };
  const last = () => h.importAcademyTasks.mock.calls.at(-1)?.[1] as { academyItemId: string; text: string }[];

  it("is done on the Chinese label in English mode too, and imports the drill under its English title", async () => {
    h.state.settings = { language: "en", isPro: true };
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importDayPlan(only, "y-wp-9"));
    expect(last()).toHaveLength(1);
    expect(last()[0]).toMatchObject({ academyItemId: drill.id, text: drill.titleEn });
    await act(() => result.current.importWeekdayRoutine(only, "tuesday"));
    expect(last()[0]).toMatchObject({ academyItemId: drill.id, text: drill.titleEn });
  });

  it("each unmatched label in a plan gets its own English text, not the first one's", async () => {
    h.state.settings = { language: "en", isPro: true };
    const two = {
      ...only,
      weeklyRoutine: {
        ...only.weeklyRoutine,
        dayPlans: [
          {
            ...plan,
            id: "y-wp-8",
            weekday: "tuesday" as const,
            taskLabelsZh: ["Qxz动作 3组", "Wvk动作 5次"],
            taskLabelsEn: ["Qxz Move 3 sets", "Wvk Move 5 reps"],
          },
        ],
      },
    };
    const { result } = renderHook(() => useAcademyImport());
    await act(() => result.current.importDayPlan(two, "y-wp-8"));
    expect(last().map((c) => c.text)).toEqual(["Qxz Move 3 sets", "Wvk Move 5 reps"]);
  });
});
