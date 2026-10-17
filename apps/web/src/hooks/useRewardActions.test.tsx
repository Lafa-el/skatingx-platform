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
