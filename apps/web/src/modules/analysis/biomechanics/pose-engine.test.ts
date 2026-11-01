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
  /** When set, send() waits for it, so a test can act while a warmup is in flight. */
  static gate: Promise<void> | null = null;
  static instances: FakePose[] = [];
  closed = false;

  constructor() {
    FakePose.instances.push(this);
  }

  setOptions(): void {}

  onResults(): void {}

  send(): Promise<void> {
    FakePose.sends += 1;
    if (FakePose.hang) return new Promise(() => undefined);
    return FakePose.gate ?? Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

afterEach(async () => {
  FakePose.hang = false;
  FakePose.gate = null;
  FakePose.instances = [];
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

  describe("who owns the kept instance", () => {
    it("a release during warmup supersedes that load: it rejects, closes its own instance and keeps nothing", async () => {
      (window as unknown as { Pose: typeof FakePose }).Pose = FakePose;
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      let open = () => undefined as void;
      FakePose.gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      const rejected = loadPoseEngine(() => undefined).then(
        () => "resolved",
        (error: unknown) => (error instanceof Error ? error.message : "unknown"),
      );
      await vi.waitFor(() => expect(FakePose.sends).toBe(1));

      await releasePoseEngine(); // nothing is kept yet: only the generation moves on
      open();

      expect(await rejected).toBe("pose-warmup-superseded");
      expect(FakePose.instances).toHaveLength(1);
      expect(FakePose.instances[0]?.closed).toBe(true);

      // Nothing was kept, so the next load builds a fresh instance instead of reusing a closed one.
      FakePose.gate = null;
      await loadPoseEngine(() => undefined);
      expect(FakePose.instances).toHaveLength(2);
      expect(FakePose.instances[1]?.closed).toBe(false);
    });

    it("close() on any handle releases the one kept instance, which is why a stale handle must not be closed", async () => {
      (window as unknown as { Pose: typeof FakePose }).Pose = FakePose;
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      const stale = await loadPoseEngine(() => undefined);
      await releasePoseEngine();
      await loadPoseEngine(() => undefined);
      expect(FakePose.instances.map((instance) => instance.closed)).toEqual([true, false]);

      await stale.close();

      expect(FakePose.instances.map((instance) => instance.closed)).toEqual([true, true]);
    });
  });
});
