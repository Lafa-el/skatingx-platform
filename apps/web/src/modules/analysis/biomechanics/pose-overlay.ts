import type { AnalysisCrop } from "@skatingx/skating-domain";
import { LEGACY_POSE_LIMITS, poseSendSize } from "@skatingx/skating-domain";

import type { PoseLandmark } from "./pose-engine";

const CONNECTIONS: readonly (readonly [number, number])[] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

export function drawPoseOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: {
    readonly roll: number;
    readonly grid: boolean;
    readonly landmarks: readonly PoseLandmark[] | null;
  },
): void {
  context.clearRect(0, 0, width, height);
  if (input.grid) {
    context.save();
    context.strokeStyle = Math.abs(input.roll) <= 1 ? "rgba(15, 118, 110, 0.35)" : "rgba(180, 83, 9, 0.35)";
    context.lineWidth = 1;
    for (let index = 1; index < 4; index += 1) {
      context.beginPath();
      context.moveTo((width / 4) * index, 0);
      context.lineTo((width / 4) * index, height);
      context.moveTo(0, (height / 4) * index);
      context.lineTo(width, (height / 4) * index);
      context.stroke();
    }
    context.translate(width / 2, height / 2);
    context.rotate((input.roll * Math.PI) / 180);
    context.beginPath();
    context.moveTo(-30, 0);
    context.lineTo(30, 0);
    context.moveTo(0, -30);
    context.lineTo(0, 30);
    context.stroke();
    context.restore();
  }
  if (!input.landmarks) return;
  const at = (index: number) => input.landmarks?.[index];
  context.strokeStyle = "rgba(15, 61, 92, 0.9)";
  context.lineWidth = 2;
  for (const [from, to] of CONNECTIONS) {
    const start = at(from);
    const end = at(to);
    if (!start || !end) continue;
    context.beginPath();
    context.moveTo(start.x * width, start.y * height);
    context.lineTo(end.x * width, end.y * height);
    context.stroke();
  }
}

export function frameCanvasSize(video: HTMLVideoElement, crop: AnalysisCrop): {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly width: number;
  readonly height: number;
} {
  const sourceWidth = video.videoWidth || LEGACY_POSE_LIMITS.maxAnalysisEdgePx;
  const sourceHeight = video.videoHeight || 360;
  const sw = Math.max(1, Math.round(crop.w * sourceWidth));
  const sh = Math.max(1, Math.round(crop.h * sourceHeight));
  const size = poseSendSize({ width: sw, height: sh });
  return {
    sx: Math.round(crop.x * sourceWidth),
    sy: Math.round(crop.y * sourceHeight),
    sw,
    sh,
    width: size.width,
    height: size.height,
  };
}

export function clockOf(sample: { readonly timeSeconds: number }): string {
  const total = Math.max(0, Math.floor(sample.timeSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
