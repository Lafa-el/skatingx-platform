import { POSE_ASSET_DIRECTORY, POSE_ASSET_VERSION } from "@skatingx/skating-domain";

export const POSE_SCRIPT_URL = `${POSE_ASSET_DIRECTORY}/pose.js`;

/**
 * How long warmup may run before the page offers a retry.
 * Operational threshold, not a model parameter.
 */
export const POSE_WARMUP_TIMEOUT_MS = 60_000;

export const POSE_PREFETCH_FILES = [
  "pose.js",
  "pose_solution_simd_wasm_bin.wasm",
  "pose_landmark_full.tflite",
  "pose_solution_packed_assets.data",
] as const;

export type PoseWarmupStage = "loadScript" | "construct" | "warmupSend";

export interface PoseLandmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly visibility?: number;
}

export interface PoseEngine {
  send(image: CanvasImageSource): Promise<void>;
  close(): Promise<void>;
}

interface PoseResults {
  readonly poseLandmarks?: PoseLandmark[];
}

interface PoseInstance {
  setOptions(options: {
    modelComplexity: 1;
    smoothLandmarks: true;
    minDetectionConfidence: 0.5;
    minTrackingConfidence: 0.5;
  }): void;
  onResults(callback: (results: PoseResults) => void): void;
  send(input: { image: CanvasImageSource }): Promise<void>;
  close(): Promise<void>;
}

type PoseConstructor = new (config: { locateFile: (file: string) => string }) => PoseInstance;

function poseConstructor(): PoseConstructor | undefined {
  return (window as unknown as { Pose?: PoseConstructor }).Pose;
}

let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (poseConstructor()) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = POSE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error("pose-script-missing"));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/**
 * Owner decision 2026-10-19: close the instance when the page resets the video
 * or unmounts. M5 still checks that the other locked metrics did not move.
 */
let kept: PoseInstance | null = null;
let loadGeneration = 0;

export async function releasePoseEngine(): Promise<void> {
  loadGeneration += 1;
  const instance = kept;
  kept = null;
  if (!instance) return;
  await instance.close();
}

function logStage(stage: PoseWarmupStage, startedAt: number): void {
  console.info({ stage, ms: Math.round(performance.now() - startedAt) });
}

async function closeQuietly(instance: PoseInstance | null): Promise<void> {
  if (!instance) return;
  await instance.close().catch(() => undefined);
}

export function prefetchPoseAssets(): void {
  if (typeof fetch !== "function") return;
  for (const file of POSE_PREFETCH_FILES) {
    void fetch(`${POSE_ASSET_DIRECTORY}/${file}`).catch(() => undefined);
  }
}

export async function loadPoseEngine(
  onResults: (landmarks: PoseLandmark[] | null) => void,
  observe?: { onStage?: (stage: PoseWarmupStage) => void },
): Promise<PoseEngine> {
  const generation = loadGeneration;
  let abandoned = false;
  let settled = false;
  let pending: PoseInstance | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const body = (async () => {
    observe?.onStage?.("loadScript");
    const scriptStarted = performance.now();
    try {
      await loadScript();
    } finally {
      logStage("loadScript", scriptStarted);
    }
    if (abandoned || generation !== loadGeneration) {
      throw new Error(abandoned ? "pose-warmup-timeout" : "pose-warmup-superseded");
    }
    const Pose = poseConstructor();
    if (!Pose) {
      throw new Error("pose-script-missing");
    }
    if (!kept) {
      observe?.onStage?.("construct");
      const constructStarted = performance.now();
      const pose = new Pose({
        locateFile: (file) => `${POSE_ASSET_DIRECTORY}/${file}`,
      });
      pending = pose;
      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      logStage("construct", constructStarted);
      if (abandoned || generation !== loadGeneration) {
        pending = null;
        await closeQuietly(pose);
        throw new Error(abandoned ? "pose-warmup-timeout" : "pose-warmup-superseded");
      }
      observe?.onStage?.("warmupSend");
      const warmupStarted = performance.now();
      const warmup = document.createElement("canvas");
      warmup.width = 1;
      warmup.height = 1;
      try {
        await pose.send({ image: warmup });
      } finally {
        logStage("warmupSend", warmupStarted);
      }
      if (abandoned || generation !== loadGeneration) {
        pending = null;
        await closeQuietly(pose);
        throw new Error(abandoned ? "pose-warmup-timeout" : "pose-warmup-superseded");
      }
      kept = pose;
      pending = null;
    }
    if (generation !== loadGeneration) {
      throw new Error("pose-warmup-superseded");
    }
    const instance = kept;
    if (!instance) {
      throw new Error("pose-script-missing");
    }
    instance.onResults((results) => {
      onResults(results.poseLandmarks ?? null);
    });
    return {
      send(image: CanvasImageSource) {
        return instance.send({ image });
      },
      close() {
        return releasePoseEngine();
      },
    } satisfies PoseEngine;
  })().catch((error: unknown) => {
    if (settled) return new Promise<PoseEngine>(() => undefined);
    throw error;
  });

  try {
    return await Promise.race([
      body,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          abandoned = true;
          const instance = pending;
          pending = null;
          void closeQuietly(instance);
          reject(new Error("pose-warmup-timeout"));
        }, POSE_WARMUP_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    settled = true;
    throw error;
  } finally {
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const poseAssetVersion = POSE_ASSET_VERSION;
