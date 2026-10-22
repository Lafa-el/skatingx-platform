// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  POSE_PREFETCH_FILES,
  POSE_WARMUP_TIMEOUT_MS,
  loadPoseEngine,
  prefetchPoseAssets,
  releasePoseEngine,
} from "./pose-engine";

class FakePose {
  static sends = 0;
  static hang = false;
  closed = false;

  setOptions(): void {}

  onResults(): void {}

  send(): Promise<void> {
    FakePose.sends += 1;
    if (FakePose.hang) return new Promise(() => undefined);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

afterEach(async () => {
  FakePose.hang = false;
  FakePose.sends = 0;
  delete (window as unknown as { Pose?: unknown }).Pose;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await releasePoseEngine();
});

describe("pose engine warmup", () => {
  it("logs one duration for each warmup stage", async () => {
    (window as unknown as { Pose: typeof FakePose }).Pose = FakePose;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await loadPoseEngine(() => undefined);
    const stages = info.mock.calls.map((call) => (call[0] as { stage: string }).stage);
    expect(stages).toEqual(["loadScript", "construct", "warmupSend"]);
    for (const call of info.mock.calls) {
      expect(call[0]).toMatchObject({ ms: expect.any(Number) });
    }
    expect(FakePose.sends).toBe(1);
  });

  it("rejects a hung warmup at the operational timeout and does not keep the instance", async () => {
    (window as unknown as { Pose: typeof FakePose }).Pose = FakePose;
    FakePose.hang = true;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.useFakeTimers();
    const pending = loadPoseEngine(() => undefined);
    const rejected = pending.then(
      () => "resolved",
      (error: unknown) => (error instanceof Error ? error.message : "unknown"),
    );
    await vi.advanceTimersByTimeAsync(POSE_WARMUP_TIMEOUT_MS);
    expect(await rejected).toBe("pose-warmup-timeout");
    FakePose.hang = false;
    await loadPoseEngine(() => undefined);
    expect(FakePose.sends).toBe(2);
  });

  it("prefetches the four pose files and ignores a failed fetch", async () => {
    const fetchMock = vi.fn((_url: string) => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchMock);
    expect(() => prefetchPoseAssets()).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(POSE_PREFETCH_FILES.length);
    await Promise.resolve();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.endsWith("/pose.js"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/pose_solution_simd_wasm_bin.wasm"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/pose_landmark_full.tflite"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/pose_solution_packed_assets.data"))).toBe(true);
  });
});
