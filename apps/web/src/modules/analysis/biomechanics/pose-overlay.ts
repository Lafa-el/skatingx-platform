import type { AnalysisCrop } from "@skatingx/skating-domain";
import { LEGACY_POSE_LIMITS, poseSendSize } from "@skatingx/skating-domain";

import type { PoseLandmark } from "./pose-engine";

/**
 * Pose 0.5 `POSE_CONNECTIONS`, the list `drawConnectors` walks on the old site.
 * Colors below are the arguments in `safeDrawSkeleton` and `drawSupportLegHighlight`
 * (`blaze-skate-analysis` index.html). `visibilityMin` is drawing_utils' default;
 * the old call does not override it.
 */
export const POSE_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

export const POSE_CONNECTOR_STYLE = {
  color: "rgba(255,255,255,0.35)",
  lineWidth: 2.5,
  visibilityMin: 0.5,
} as const;

export const POSE_LANDMARK_STYLE = {
  color: "#8b5cf6",
  lineWidth: 1,
  radius: 3,
  visibilityMin: 0.5,
} as const;

export const SUPPORT_LEG_STYLE = {
  color: "#22c55e",
  lineWidth: 7,
  shadowColor: "rgba(34, 197, 94, 0.55)",
  shadowBlur: 10,
  jointRadius: 6,
  jointStroke: "#ffffff",
  jointLineWidth: 2,
} as const;

const SUPPORT_CHAIN = {
  left: [23, 25, 27],
  right: [24, 26, 28],
} as const;

export function supportOverlaySide(sample: {
  readonly readable: boolean;
  readonly supportSide: "left" | "right" | "unknown";
}): "left" | "right" | null {
  if (!sample.readable || sample.supportSide === "unknown") return null;
  return sample.supportSide;
}

function landmarkVisible(point: PoseLandmark | null | undefined, minimum: number): point is PoseLandmark {
  if (!point) return false;
  return point.visibility === undefined || point.visibility > minimum;
}

export function drawPoseOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: {
    readonly roll: number;
    readonly grid: boolean;
    readonly landmarks: readonly PoseLandmark[] | null;
    readonly supportSide?: "left" | "right" | null;
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
  context.save();
  for (const [from, to] of POSE_CONNECTIONS) {
    const start = at(from);
    const end = at(to);
    if (!landmarkVisible(start, POSE_CONNECTOR_STYLE.visibilityMin) || !landmarkVisible(end, POSE_CONNECTOR_STYLE.visibilityMin)) {
      continue;
    }
    context.beginPath();
    context.strokeStyle = POSE_CONNECTOR_STYLE.color;
    context.lineWidth = POSE_CONNECTOR_STYLE.lineWidth;
    context.moveTo(start.x * width, start.y * height);
    context.lineTo(end.x * width, end.y * height);
    context.stroke();
  }
  for (const point of input.landmarks) {
    if (!landmarkVisible(point, POSE_LANDMARK_STYLE.visibilityMin)) continue;
    context.beginPath();
    context.fillStyle = POSE_LANDMARK_STYLE.color;
    context.strokeStyle = POSE_LANDMARK_STYLE.color;
    context.lineWidth = POSE_LANDMARK_STYLE.lineWidth;
    context.arc(point.x * width, point.y * height, POSE_LANDMARK_STYLE.radius, 0, 2 * Math.PI);
    context.fill();
    context.stroke();
  }
  context.restore();
  drawSupportLeg(context, width, height, input.landmarks, input.supportSide ?? null);
}

function drawSupportLeg(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: readonly PoseLandmark[],
  side: "left" | "right" | null,
): void {
  if (!side) return;
  const [hipIndex, kneeIndex, ankleIndex] = SUPPORT_CHAIN[side];
  const hip = landmarks[hipIndex];
  const knee = landmarks[kneeIndex];
  const ankle = landmarks[ankleIndex];
  if (!hip || !knee || !ankle) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = SUPPORT_LEG_STYLE.color;
  context.lineWidth = SUPPORT_LEG_STYLE.lineWidth;
  context.shadowColor = SUPPORT_LEG_STYLE.shadowColor;
  context.shadowBlur = SUPPORT_LEG_STYLE.shadowBlur;
  context.beginPath();
  context.moveTo(hip.x * width, hip.y * height);
  context.lineTo(knee.x * width, knee.y * height);
  context.lineTo(ankle.x * width, ankle.y * height);
  context.stroke();
  context.shadowBlur = 0;
  for (const point of [hip, knee, ankle]) {
    context.beginPath();
    context.arc(point.x * width, point.y * height, SUPPORT_LEG_STYLE.jointRadius, 0, 2 * Math.PI);
    context.fillStyle = SUPPORT_LEG_STYLE.color;
    context.fill();
    context.strokeStyle = SUPPORT_LEG_STYLE.jointStroke;
    context.lineWidth = SUPPORT_LEG_STYLE.jointLineWidth;
    context.stroke();
  }
  context.restore();
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
