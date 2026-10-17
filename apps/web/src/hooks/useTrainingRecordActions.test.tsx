// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@/test/dom";

import { useTrainingRecordActions } from "./useTrainingRecordActions";

const h = vi.hoisted(() => {
  const base = () => ({
    uid: "uid-1" as string | null,
    settings: { language: "zh", activeAthleteId: "athlete-9" } as Record<string, unknown> | null,
    db: {} as object | null,
  });
  return {
    base,
    state: base(),
    addTimeEntry: vi.fn(async (..._args: unknown[]) => "added"),
  };
});

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.state.uid }) }));
vi.mock("@/app/providers/FirestoreProvider", () => ({ useUserSettings: () => ({ data: h.state.settings }) }));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => h.state.db,
  addTimeEntry: h.addTimeEntry,
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
}));

afterEach(() => {
  h.state = h.base();
  h.addTimeEntry.mockClear();
  h.addTimeEntry.mockImplementation(async () => "added");
});

const input = { date: "2026-10-12", timeSeconds: 49.8 };

describe("useTrainingRecordActions: errors", () => {
  it("not signed in: says so in the language, writes nothing, and still throws", async () => {
    h.state.uid = null;
    const { result, rerender } = renderHook(() => useTrainingRecordActions());
    await act(async () => {
      await expect(result.current.addEntry("500m", "500m", input)).rejects.toThrow();
    });
    expect(result.current.actionError).toBe("登录状态还没准备好，请稍后再试。");
    expect(h.addTimeEntry).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.actionError).toBe("Sign in required.");
  });

  it("data service unavailable: says so in the language and still throws", async () => {
    h.state.db = null;
    const { result, rerender } = renderHook(() => useTrainingRecordActions());
    await act(async () => {
      await expect(result.current.removeEntry("500m", "500m", "e1")).rejects.toThrow();
    });
    expect(result.current.actionError).toBe("数据服务暂时不可用，请稍后再试。");

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.actionError).toBe("Firestore is not available.");
  });

  it("a message from the data layer is shown as it arrived, and the error is rethrown to the page", async () => {
    h.addTimeEntry.mockRejectedValue(new Error("permission-denied"));
    const { result } = renderHook(() => useTrainingRecordActions());
    await act(async () => {
      await expect(result.current.addEntry("500m", "500m", input)).rejects.toThrow("permission-denied");
    });
    expect(result.current.actionError).toBe("permission-denied");
  });

  it("a failure that is not an Error is reported as the action failing, in the language", async () => {
    h.addTimeEntry.mockRejectedValue("boom");
    const { result, rerender } = renderHook(() => useTrainingRecordActions());
    await act(async () => {
      await expect(result.current.addEntry("500m", "500m", input)).rejects.toBe("boom");
    });
    expect(result.current.actionError).toBe("保存纪录失败。");

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.actionError).toBe("Record action failed.");
  });

  it("clearing removes the message, and a new attempt starts without it", async () => {
    h.addTimeEntry.mockRejectedValueOnce(new Error("permission-denied"));
    const { result } = renderHook(() => useTrainingRecordActions());
    await act(async () => {
      await expect(result.current.addEntry("500m", "500m", input)).rejects.toThrow();
    });
    act(() => result.current.clearActionError());
    expect(result.current.actionError).toBeNull();

    h.addTimeEntry.mockRejectedValueOnce(new Error("again"));
    await act(async () => {
      await expect(result.current.addEntry("500m", "500m", input)).rejects.toThrow();
    });
    await act(async () => {
      await result.current.addEntry("500m", "500m", input);
    });
    expect(result.current.actionError).toBeNull();
  });

  it("writes for the signed-in user and the active athlete", async () => {
    const { result } = renderHook(() => useTrainingRecordActions());
    await act(async () => {
      await result.current.addEntry("500m", "500m", input);
    });
    expect(h.addTimeEntry.mock.calls[0]?.[0]).toMatchObject({ userId: "uid-1", athleteId: "athlete-9" });
    expect(result.current.actionError).toBeNull();
  });
});
