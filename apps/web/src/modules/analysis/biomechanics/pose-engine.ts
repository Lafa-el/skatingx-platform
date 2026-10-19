import { POSE_ASSET_DIRECTORY, POSE_ASSET_VERSION } from "@skatingx/skating-domain";

export const POSE_SCRIPT_URL = `${POSE_ASSET_DIRECTORY}/pose.js`;

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

export async function releasePoseEngine(): Promise<void> {
  const instance = kept;
  kept = null;
  if (!instance) return;
  await instance.close();
}

export async function loadPoseEngine(
  onResults: (landmarks: PoseLandmark[] | null) => void,
): Promise<PoseEngine> {
  await loadScript();
  const Pose = poseConstructor();
  if (!Pose) {
    throw new Error("pose-script-missing");
  }
  if (!kept) {
    const pose = new Pose({
      locateFile: (file) => `${POSE_ASSET_DIRECTORY}/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    const warmup = document.createElement("canvas");
    warmup.width = 1;
    warmup.height = 1;
    await pose.send({ image: warmup });
    kept = pose;
  }
  const instance = kept;
  instance.onResults((results) => {
    onResults(results.poseLandmarks ?? null);
  });
  return {
    send(image) {
      return instance.send({ image });
    },
    close() {
      return releasePoseEngine();
    },
  };
}

export const poseAssetVersion = POSE_ASSET_VERSION;
