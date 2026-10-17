// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@/test/dom";

import { useTrainingActions } from "./useTrainingActions";

const h = vi.hoisted(() => {
  const base = () => ({
    uid: "uid-1" as string | null,
    settings: { language: "zh", activeAthleteId: "athlete-9" } as Record<string, unknown> | null,
    db: {} as object | null,
  });
  return {
    base,
    state: base(),
    addTrainingTask: vi.fn(async (..._args: unknown[]) => "added"),
    deleteTrainingTask: vi.fn(async (..._args: unknown[]) => "deleted"),
    toggleTrainingTask: vi.fn(async (..._args: unknown[]) => ({ bonusApplied: false, bonusRemoved: false })),
  };
});

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.state.uid }) }));
vi.mock("@/app/providers/FirestoreProvider", () => ({ useUserSettings: () => ({ data: h.state.settings }) }));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => h.state.db,
  addTrainingTask: h.addTrainingTask,
  deleteTrainingTask: h.deleteTrainingTask,
  toggleTrainingTask: h.toggleTrainingTask,
}));

afterEach(() => {
  h.state = h.base();
  h.addTrainingTask.mockClear();
  h.addTrainingTask.mockImplementation(async () => "added");
  h.deleteTrainingTask.mockClear();
  h.toggleTrainingTask.mockClear();
});

const NOT_SIGNED_IN = {
  zh: "登录状态还没准备好，请稍后再试。",
  en: "Sign-in is not ready yet. Try again in a moment.",
};
const UNAVAILABLE = {
  zh: "数据服务暂时不可用，请稍后再试。",
  en: "Firestore is not available right now. Try again later.",
};
const ACTION_FAILED = { zh: "任务操作失败。", en: "Training action failed." };

describe("useTrainingActions: a task action that cannot start tells the user why", () => {
  it("not signed in: says so in the language, writes nothing, still throws, and is not left busy", async () => {
    h.state.uid = null;
    const { result, rerender } = renderHook(() => useTrainingActions());
    await act(async () => {
      await expect(result.current.addTask("run", "5 laps")).rejects.toThrow();
    });
    expect(result.current.actionError).toBe(NOT_SIGNED_IN.zh);
    expect(h.addTrainingTask).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.actionError).toBe(NOT_SIGNED_IN.en);
  });

  it("data service unavailable: says so in the language for every kind of action", async () => {
    h.state.db = null;
    const { result, rerender } = renderHook(() => useTrainingActions());
    await act(async () => {
      await expect(result.current.toggleTask("t1")).rejects.toThrow();
    });
    expect(result.current.actionError).toBe(UNAVAILABLE.zh);
    await act(async () => {
      await expect(result.current.removeTask("t1")).rejects.toThrow();
    });
    expect(result.current.actionError).toBe(UNAVAILABLE.zh);
    expect(h.toggleTrainingTask).not.toHaveBeenCalled();
    expect(h.deleteTrainingTask).not.toHaveBeenCalled();

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.actionError).toBe(UNAVAILABLE.en);
  });
});

describe("useTrainingActions: a write that fails", () => {
  it("shows a message from the data layer as it arrived, and rethrows it", async () => {
    h.addTrainingTask.mockRejectedValue(new Error("permission-denied"));
    const { result } = renderHook(() => useTrainingActions());
    await act(async () => {
      await expect(result.current.addTask("run")).rejects.toThrow("permission-denied");
    });
    expect(result.current.actionError).toBe("permission-denied");
    expect(result.current.busy).toBe(false);
  });

  it("reports a failure that is not an Error as the action failing, in the language", async () => {
    h.addTrainingTask.mockRejectedValue("boom");
    const { result, rerender } = renderHook(() => useTrainingActions());
    await act(async () => {
      await expect(result.current.addTask("run")).rejects.toBe("boom");
    });
    expect(result.current.actionError).toBe(ACTION_FAILED.zh);

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.actionError).toBe(ACTION_FAILED.en);
  });
});

describe("useTrainingActions: working", () => {
  it("writes for the signed-in user and the active athlete and returns the result", async () => {
    const { result } = renderHook(() => useTrainingActions());
    await act(async () => {
      await result.current.addTask("run", "5 laps");
      await result.current.toggleTask("t1");
      await result.current.removeTask("t1");
    });
    const context = { db: h.state.db, userId: "uid-1", athleteId: "athlete-9" };
    expect(h.addTrainingTask).toHaveBeenCalledExactlyOnceWith(context, "run", "5 laps");
    expect(h.toggleTrainingTask).toHaveBeenCalledExactlyOnceWith(context, "t1");
    expect(h.deleteTrainingTask).toHaveBeenCalledExactlyOnceWith(context, "t1");
    expect(result.current.actionError).toBeNull();
  });

  it("without a chosen athlete it writes for the default one", async () => {
    h.state.settings = { language: "zh" };
    const { result } = renderHook(() => useTrainingActions());
    await act(async () => {
      await result.current.addTask("run");
    });
    expect(h.addTrainingTask.mock.calls[0]?.[0]).toMatchObject({ athleteId: "lindsay" });
  });

  it("clearing removes the message, and a new attempt starts without it", async () => {
    h.state.uid = null;
    const { result, rerender } = renderHook(() => useTrainingActions());
    await act(async () => {
      await expect(result.current.addTask("run")).rejects.toThrow();
    });
    act(() => result.current.clearActionError());
    expect(result.current.actionError).toBeNull();

    await act(async () => {
      await expect(result.current.addTask("run")).rejects.toThrow();
    });
    h.state.uid = "uid-1";
    rerender();
    await act(async () => {
      await result.current.addTask("run");
    });
    expect(result.current.actionError).toBeNull();
  });
});
