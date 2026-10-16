// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@/test/dom";

import { useNowIso } from "./useNowIso";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T03:59:30.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useNowIso", () => {
  it("starts at the current instant", () => {
    const { result } = renderHook(() => useNowIso());
    expect(result.current).toBe("2026-10-24T03:59:30.000Z");
  });

  it("moves forward every minute, so an open page notices a new day", () => {
    const { result } = renderHook(() => useNowIso());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe("2026-10-24T04:00:30.000Z");
  });

  it("releases its timer on unmount", () => {
    const { unmount } = renderHook(() => useNowIso());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
