/**
 * Session rules around the locked pose interpreter.
 * `interpretPoseFrame` stays the live path. A manual support leg is applied
 * only to the sample being captured, then discarded.
 */

import {
  calculateAngle,
  classifyPoseIssue,
  interpretPoseFrame,
  LEGACY_POSE_LIMITS,
  type PlanePoint,
  type PoseFrameMetrics,
  type SupportTracker,
  type TrackingState,
} from "./legacy-pose";

export const MAX_POSE_KEYFRAMES = 10;

export const POSE_ASSET_VERSION = "0.5.1675469404";
export const POSE_ASSET_DIRECTORY = `/mediapipe/pose/${POSE_ASSET_VERSION}`;

export type SupportOverride = "auto" | "left" | "right";

export interface AnalysisCrop {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PoseKeyframeSample {
  readonly timeSeconds: number;
  readonly readable: boolean;
  readonly unreadableReason: PoseFrameMetrics["unreadableReason"];
  readonly kneeAngle: number | null;
  readonly leanAngle: number | null;
  readonly pelvisHeight: number | null;
  readonly recoveryRate: number | null;
  readonly supportSide: "left" | "right" | "unknown";
  readonly supportConfidence: number | null;
  readonly manual: boolean;
  readonly issue: string | null;
}

export function analysisCrop(input: {
  readonly locked: boolean;
  readonly jumpRejects: number;
  readonly target: PlanePoint | null;
}): AnalysisCrop {
  const hasTarget =
    input.locked &&
    input.target !== null &&
    input.jumpRejects < LEGACY_POSE_LIMITS.targetReacquireAfter;
  const w = hasTarget ? 0.62 : 0.74;
  const h = hasTarget ? 0.92 : 1;
  const centerX = hasTarget && input.target ? input.target.x : 0.5;
  const centerY = hasTarget && input.target ? input.target.y : 0.5;
  return {
    x: Math.max(0, Math.min(1 - w, centerX - w / 2)),
    y: Math.max(0, Math.min(1 - h, centerY - h / 2)),
    w,
    h,
  };
}

/** Longest side of the canvas sent to Pose. Legacy caps the crop width at 640. */
export function poseSendSize(cropPixels: { readonly width: number; readonly height: number }): {
  readonly width: number;
  readonly height: number;
} {
  const scale = Math.min(1, LEGACY_POSE_LIMITS.maxAnalysisEdgePx / Math.max(1, cropPixels.width));
  return {
    width: Math.max(1, Math.round(cropPixels.width * scale)),
    height: Math.max(1, Math.round(cropPixels.height * scale)),
  };
}

export function mapLandmarksFromCrop(
  landmarks: readonly PlanePoint[],
  crop: AnalysisCrop,
): PlanePoint[] {
  return landmarks.map((point) => ({
    ...point,
    x: crop.x + point.x * crop.w,
    y: crop.y + point.y * crop.h,
  }));
}

export function rotatePoint(point: PlanePoint, angleDegrees: number, center: PlanePoint = { x: 0.5, y: 0.5 }): PlanePoint {
  const radians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    ...point,
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function videoPointer(input: {
  readonly clientX: number;
  readonly clientY: number;
  readonly left: number;
  readonly top: number;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
}): PlanePoint | null {
  const videoWidth = input.videoWidth || 16;
  const videoHeight = input.videoHeight || 9;
  const videoAspect = videoWidth / videoHeight;
  const boxAspect = input.boxWidth / input.boxHeight;
  let renderWidth = input.boxWidth;
  let renderHeight = input.boxHeight;
  let offsetX = 0;
  let offsetY = 0;
  if (boxAspect > videoAspect) {
    renderWidth = input.boxHeight * videoAspect;
    offsetX = (input.boxWidth - renderWidth) / 2;
  } else {
    renderHeight = input.boxWidth / videoAspect;
    offsetY = (input.boxHeight - renderHeight) / 2;
  }
  const x = (input.clientX - input.left - offsetX) / renderWidth;
  const y = (input.clientY - input.top - offsetY) / renderHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function lockTarget(point: PlanePoint): TrackingState {
  const clamped = {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  };
  return {
    lastTargetCom: clamped,
    smoothedCom: clamped,
    poseJumpRejectCount: 0,
    manualTargetWarmupFrames: LEGACY_POSE_LIMITS.manualLockWarmupFrames,
  };
}

function sideOf(metrics: PoseFrameMetrics): PoseKeyframeSample["supportSide"] {
  if (metrics.supportSide === "运动员左腿") return "left";
  if (metrics.supportSide === "运动员右腿") return "right";
  return "unknown";
}

function recoveryRate(metrics: PoseFrameMetrics): number | null {
  if (!metrics.readable) return null;
  const value = Number(metrics.recoveryDisplay);
  return Number.isFinite(value) ? value : null;
}

function pelvisRatio(metrics: PoseFrameMetrics): number | null {
  if (metrics.leanAngle === null && !metrics.readable) return null;
  const value = Number(metrics.pelvisDisplay.replace("%", ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * Manual left/right replaces only this sample's knee. The tracker returned
 * here is still the automatic one, so the next live frame is unchanged.
 */
export function samplePoseFrame(input: {
  readonly tracking: TrackingState;
  readonly support: SupportTracker;
  readonly landmarks: readonly (PlanePoint | null)[] | null;
  readonly timeSeconds: number;
  readonly supportMode: SupportOverride;
}): {
  readonly tracking: TrackingState;
  readonly support: SupportTracker;
  readonly live: PoseFrameMetrics;
  readonly sample: PoseKeyframeSample;
} {
  const interpreted = interpretPoseFrame(input.tracking, input.support, {
    landmarks: input.landmarks,
    keyframePending: true,
  });
  const live = interpreted.metrics;
  const manual = manualKnee(input.landmarks, input.supportMode);
  const kneeAngle = manual ? manual.kneeAngle : live.kneeAngle;
  const readable = manual ? manual.readable : live.readable;
  const supportSide = manual ? manual.side : sideOf(live);
  const supportConfidence = manual ? manual.confidence : live.supportConfidence;
  const leanAngle = live.leanAngle;
  const pelvisHeight = pelvisRatio(live);
  const issue =
    readable && kneeAngle !== null && leanAngle !== null && pelvisHeight !== null
      ? classifyPoseIssue({ kneeAngle, leanAngle, pelvisHeight })
      : null;
  return {
    tracking: interpreted.tracking,
    support: interpreted.support,
    live,
    sample: {
      timeSeconds: input.timeSeconds,
      readable,
      unreadableReason: readable ? null : live.unreadableReason,
      kneeAngle: readable ? kneeAngle : null,
      leanAngle,
      pelvisHeight,
      recoveryRate: readable ? recoveryRate({ ...live, readable: true }) : null,
      supportSide,
      supportConfidence,
      manual: manual !== null,
      issue,
    },
  };
}

function manualKnee(
  landmarks: readonly (PlanePoint | null)[] | null,
  mode: SupportOverride,
): { readonly kneeAngle: number; readonly readable: boolean; readonly side: "left" | "right"; readonly confidence: number } | null {
  if (mode === "auto" || !landmarks) return null;
  const hip = landmarks[mode === "left" ? 23 : 24];
  const knee = landmarks[mode === "left" ? 25 : 26];
  const ankle = landmarks[mode === "left" ? 27 : 28];
  if (!hip || !knee || !ankle) return null;
  const visibility = [hip, knee, ankle].reduce((sum, point) => sum + (point.visibility ?? 1), 0) / 3;
  if (visibility < 0.35) {
    return { kneeAngle: calculateAngle(hip, knee, ankle), readable: false, side: mode, confidence: Math.round(visibility * 100) };
  }
  return { kneeAngle: calculateAngle(hip, knee, ankle), readable: true, side: mode, confidence: 100 };
}

export function appendKeyframe(
  samples: readonly PoseKeyframeSample[],
  sample: PoseKeyframeSample,
): readonly PoseKeyframeSample[] {
  const next = [...samples, sample];
  return next.length > MAX_POSE_KEYFRAMES ? next.slice(next.length - MAX_POSE_KEYFRAMES) : next;
}

export interface KeyframeAggregate {
  readonly readable: number;
  readonly unreadable: number;
  readonly avgKnee: number | null;
  readonly avgLean: number | null;
  readonly highKnee: number;
  readonly highLean: number;
}

/** Averages use readable frames only. Unreadable rows stay in the list. */
export function aggregateKeyframes(samples: readonly PoseKeyframeSample[]): KeyframeAggregate {
  const readable = samples.filter((sample) => sample.readable && sample.kneeAngle !== null && sample.leanAngle !== null);
  const avg = (pick: (sample: PoseKeyframeSample) => number) =>
    readable.length === 0 ? null : Math.round(readable.reduce((sum, sample) => sum + pick(sample), 0) / readable.length);
  return {
    readable: readable.length,
    unreadable: samples.length - readable.length,
    avgKnee: avg((sample) => sample.kneeAngle ?? 0),
    avgLean: avg((sample) => sample.leanAngle ?? 0),
    highKnee: readable.filter((sample) => (sample.kneeAngle ?? 0) > 115).length,
    highLean: readable.filter((sample) => (sample.leanAngle ?? 0) > 52).length,
  };
}
