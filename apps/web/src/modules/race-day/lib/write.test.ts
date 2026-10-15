import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QUEUED_AFTER_MS, settleWrite } from "./write";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("settleWrite", () => {
  it("reports saved when the server acknowledges before the timeout", async () => {
    const d = deferred();
    const onLateError = vi.fn();
    const outcome = settleWrite(d.promise, { onLateError });
    d.resolve();
    await expect(outcome).resolves.toEqual({ kind: "saved" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports queued after the timeout while the write is still pending", async () => {
    const d = deferred();
    const outcome = settleWrite(d.promise, { onLateError: vi.fn() });
    await vi.advanceTimersByTimeAsync(QUEUED_AFTER_MS);
    await expect(outcome).resolves.toEqual({ kind: "queued" });
  });

  it("does not report queued one millisecond early", async () => {
    const d = deferred();
    let settled = false;
    void settleWrite(d.promise, { onLateError: vi.fn() }).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(QUEUED_AFTER_MS - 1);
    expect(settled).toBe(false);
  });

  it("rejects when the write fails before the timeout, without calling onLateError", async () => {
    const d = deferred();
    const onLateError = vi.fn();
    const outcome = settleWrite(d.promise, { onLateError });
    const failure = new Error("denied");
    d.reject(failure);
    await expect(outcome).rejects.toBe(failure);
    expect(onLateError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("calls onLateError when the write fails after it was reported as queued", async () => {
    const d = deferred();
    const onLateError = vi.fn();
    const outcome = settleWrite(d.promise, { onLateError });
    await vi.advanceTimersByTimeAsync(QUEUED_AFTER_MS);
    await outcome;
    const failure = new Error("rejected by rules");
    d.reject(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(onLateError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("ignores a late success after queued", async () => {
    const d = deferred();
    const onLateError = vi.fn();
    const outcome = settleWrite(d.promise, { onLateError });
    await vi.advanceTimersByTimeAsync(QUEUED_AFTER_MS);
    await expect(outcome).resolves.toEqual({ kind: "queued" });
    d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(onLateError).not.toHaveBeenCalled();
  });

  it("honours a custom timeout", async () => {
    const d = deferred();
    const outcome = settleWrite(d.promise, { queuedAfterMs: 50, onLateError: vi.fn() });
    await vi.advanceTimersByTimeAsync(50);
    await expect(outcome).resolves.toEqual({ kind: "queued" });
  });
});
