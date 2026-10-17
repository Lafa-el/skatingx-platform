// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@/test/dom";

import { useRewardActions } from "./useRewardActions";

const h = vi.hoisted(() => {
  const base = () => ({
    uid: "uid-1" as string | null,
    settings: { language: "zh", activeAthleteId: "athlete-9" } as Record<string, unknown> | null,
    db: {} as object | null,
  });
  return {
    base,
    state: base(),
    redeemReward: vi.fn(async (..._args: unknown[]) => "redeemed"),
  };
});

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.state.uid }) }));
vi.mock("@/app/providers/FirestoreProvider", () => ({ useUserSettings: () => ({ data: h.state.settings }) }));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => h.state.db,
  redeemReward: h.redeemReward,
}));

afterEach(() => {
  h.state = h.base();
  h.redeemReward.mockClear();
  h.redeemReward.mockImplementation(async () => "redeemed");
});

describe("useRewardActions: a redemption that cannot start tells the user why", () => {
  it("not signed in: says so in the language, redeems nothing, still throws, and is not left busy", async () => {
    h.state.uid = null;
    const { result, rerender } = renderHook(() => useRewardActions());
    await act(async () => {
      await expect(result.current.redeem("cheap", "Cheap", 50)).rejects.toThrow();
    });
    expect(result.current.actionError).toBe("登录状态还没准备好，请稍后再试。");
    expect(h.redeemReward).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    expect(result.current.lastSuccess).toBeNull();

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.actionError).toBe("Sign-in is not ready yet. Try again in a moment.");
  });

  it("data service unavailable: says so in the language and redeems nothing", async () => {
    h.state.db = null;
    const { result, rerender } = renderHook(() => useRewardActions());
    await act(async () => {
      await expect(result.current.redeem("cheap", "Cheap", 50)).rejects.toThrow();
    });
    expect(result.current.actionError).toBe("数据服务暂时不可用，请稍后再试。");
    expect(h.redeemReward).not.toHaveBeenCalled();

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.actionError).toBe("Firestore is not available right now. Try again later.");
  });
});

describe("useRewardActions", () => {
  it("redeems for the signed-in user and the active athlete, and keeps what was redeemed", async () => {
    const { result } = renderHook(() => useRewardActions());
    await act(async () => {
      await result.current.redeem("cheap", "便宜奖励", 50);
    });
    expect(h.redeemReward).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ userId: "uid-1", athleteId: "athlete-9" }),
      "cheap",
      "便宜奖励",
      50,
    );
    // The id is kept with the name so the page can show the name in the language it has later.
    expect(result.current.lastSuccess).toEqual({ rewardId: "cheap", rewardName: "便宜奖励" });
    expect(result.current.actionError).toBeNull();
    expect(result.current.busy).toBe(false);

    act(() => result.current.clearLastSuccess());
    expect(result.current.lastSuccess).toBeNull();
  });

  it("a new attempt clears the earlier success, so a failure is not shown next to an old \"redeemed\"", async () => {
    const { result } = renderHook(() => useRewardActions());
    await act(async () => {
      await result.current.redeem("cheap", "Cheap", 50);
    });
    expect(result.current.lastSuccess).not.toBeNull();

    h.redeemReward.mockRejectedValueOnce(new Error("denied"));
    await act(async () => {
      await expect(result.current.redeem("dear", "Dear", 500)).rejects.toThrow("denied");
    });
    expect(result.current.lastSuccess).toBeNull();
  });

  it("a message from the data layer is shown as it arrived, and the error is rethrown", async () => {
    h.redeemReward.mockRejectedValue(new Error("not-enough-points"));
    const { result } = renderHook(() => useRewardActions());
    await act(async () => {
      await expect(result.current.redeem("dear", "Dear", 500)).rejects.toThrow("not-enough-points");
    });
    expect(result.current.actionError).toBe("not-enough-points");
    expect(result.current.lastSuccess).toBeNull();
  });

  it("a failure that is not an Error is reported as the redemption failing, in the language", async () => {
    h.redeemReward.mockRejectedValue("boom");
    const { result, rerender } = renderHook(() => useRewardActions());
    await act(async () => {
      await expect(result.current.redeem("dear", "Dear", 500)).rejects.toBe("boom");
    });
    expect(result.current.actionError).toBe("兑换失败。");

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.actionError).toBe("Redemption failed.");
  });

  it("clearing removes either kind of message, and a new attempt starts without it", async () => {
    h.redeemReward.mockRejectedValueOnce("boom");
    const { result } = renderHook(() => useRewardActions());
    await act(async () => {
      await expect(result.current.redeem("dear", "Dear", 500)).rejects.toBe("boom");
    });
    act(() => result.current.clearActionError());
    expect(result.current.actionError).toBeNull();

    h.redeemReward.mockRejectedValueOnce(new Error("denied"));
    await act(async () => {
      await expect(result.current.redeem("dear", "Dear", 500)).rejects.toThrow("denied");
    });
    act(() => result.current.clearActionError());
    expect(result.current.actionError).toBeNull();

    h.redeemReward.mockRejectedValueOnce("boom");
    await act(async () => {
      await expect(result.current.redeem("dear", "Dear", 500)).rejects.toBe("boom");
    });
    await act(async () => {
      await result.current.redeem("cheap", "Cheap", 50);
    });
    expect(result.current.actionError).toBeNull();
  });
});
