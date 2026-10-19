/**
 * Behavior port of the pure pose rules in blaze-skate-analysis `index.html`.
 * The legacy file stays read-only. No DOM, no MediaPipe, no upload.
 */

export const LEGACY_POSE_LIMITS = {
  frameIntervalMs: 180,
  comSmoothing: 0.28,
  comMaxJump: 0.18,
  manualLockMaxJump: 0.34,
  targetReacquireAfter: 7,
  manualLockWarmupFrames: 5,
  targetSmoothing: 0.36,
  maxAnalysisEdgePx: 640,
} as const;

export interface PlanePoint {
  readonly x: number;
  readonly y: number;
  readonly visibility?: number;
}

export interface SupportTracker {
  readonly stableSide: "left" | "right" | null;
  readonly candidateSide: "left" | "right" | null;
  readonly candidateFrames: number;
}

export interface TrackingState {
  readonly lastTargetCom: PlanePoint | null;
  readonly smoothedCom: PlanePoint | null;
  readonly poseJumpRejectCount: number;
  readonly manualTargetWarmupFrames: number;
}

export const emptySupportTracker = (): SupportTracker => ({
  stableSide: null,
  candidateSide: null,
  candidateFrames: 0,
});

export const emptyTrackingState = (): TrackingState => ({
  lastTargetCom: null,
  smoothedCom: null,
  poseJumpRejectCount: 0,
  manualTargetWarmupFrames: 0,
});

export function calculateAngle(a: PlanePoint, b: PlanePoint, c: PlanePoint): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return Math.round(angle);
}

interface LegPoints {
  readonly hip: PlanePoint;
  readonly knee: PlanePoint;
  readonly ankle: PlanePoint;
}

function scoreSupportLeg(
  leg: LegPoints,
  otherLeg: LegPoints,
  referenceX: number,
  previousSide: SupportTracker["stableSide"],
  sideKey: "left" | "right",
) {
  const visibility =
    [leg.hip, leg.knee, leg.ankle].reduce((sum, point) => sum + (point.visibility ?? 1), 0) / 3;
  const angle = calculateAngle(leg.hip, leg.knee, leg.ankle);
  const ankleProjection = 1 - Math.min(1, Math.abs(leg.ankle.x - referenceX) / 0.3);
  const kneeProjection = 1 - Math.min(1, Math.abs(leg.knee.x - referenceX) / 0.34);
  const compactLeg = 1 - Math.min(1, Math.abs(leg.ankle.x - leg.hip.x) / 0.42);
  const lowerThanOther =
    leg.ankle.y >= otherLeg.ankle.y ? 1 : Math.max(0, 1 - (otherLeg.ankle.y - leg.ankle.y) / 0.1);
  const kneeBelowHip = leg.knee.y > leg.hip.y ? 1 : 0.3;
  const ankleBelowKnee = leg.ankle.y > leg.knee.y ? 1 : 0.35;
  const angleSupport =
    angle >= 65 && angle <= 135 ? 1 - Math.min(1, Math.abs(angle - 100) / 55) : 0.12;
  const continuity = previousSide === sideKey ? 0.08 : 0;
  const veryLowVisibilityPenalty = visibility < 0.48 ? -0.35 : 0;
  const score =
    ankleProjection * 0.24 +
    kneeProjection * 0.16 +
    compactLeg * 0.14 +
    lowerThanOther * 0.14 +
    angleSupport * 0.18 +
    visibility * 0.1 +
    kneeBelowHip * 0.03 +
    ankleBelowKnee * 0.03 +
    continuity +
    veryLowVisibilityPenalty;
  return { score, angle, visibility };
}

export interface SupportLegReading {
  readonly side: string;
  readonly sideKey: "left" | "right" | null;
  readonly confidence: number;
  readonly readable: boolean;
  readonly reason: string;
  readonly leftScore: number;
  readonly rightScore: number;
  readonly kneeAngle: number;
}

export function pickSupportLeg(
  leftLeg: LegPoints,
  rightLeg: LegPoints,
  bodyCenterX: number | null,
  tracker: SupportTracker,
): { readonly reading: SupportLegReading; readonly tracker: SupportTracker } {
  const referenceX = bodyCenterX ?? (leftLeg.hip.x + rightLeg.hip.x) / 2;
  const left = scoreSupportLeg(leftLeg, rightLeg, referenceX, tracker.stableSide, "left");
  const right = scoreSupportLeg(rightLeg, leftLeg, referenceX, tracker.stableSide, "right");
  const preferredSide = left.score >= right.score ? "left" : "right";
  const preferredScore = Math.max(left.score, right.score);
  const otherScore = Math.min(left.score, right.score);
  const margin = preferredScore - otherScore;
  const isReadable = preferredScore >= 0.48 && margin >= 0.035;
  const switchFramesNeeded = margin > 0.18 ? 2 : 4;
  const confidenceOf = (score: number) =>
    Math.max(0, Math.min(99, Math.round(score * 78 + margin * 135)));

  if (!isReadable) {
    const sideKey = tracker.stableSide;
    const kneeSource = sideKey === "right" ? rightLeg : sideKey === "left" ? leftLeg : left.score >= right.score ? leftLeg : rightLeg;
    return {
      tracker,
      reading: {
        side: sideKey === "right" ? "运动员右腿" : sideKey === "left" ? "运动员左腿" : "支撑腿不确定",
        sideKey,
        confidence: confidenceOf(preferredScore),
        readable: false,
        reason: "支撑腿候选得分接近或关键点可信度不足",
        leftScore: left.score,
        rightScore: right.score,
        kneeAngle: calculateAngle(kneeSource.hip, kneeSource.knee, kneeSource.ankle),
      },
    };
  }

  const next = ((): SupportTracker => {
    if (preferredSide === tracker.stableSide) {
      return { stableSide: tracker.stableSide, candidateSide: null, candidateFrames: 0 };
    }
    const candidateFrames = tracker.candidateSide === preferredSide ? tracker.candidateFrames + 1 : 1;
    if (!tracker.stableSide || candidateFrames >= switchFramesNeeded) {
      return { stableSide: preferredSide, candidateSide: null, candidateFrames: 0 };
    }
    return { stableSide: tracker.stableSide, candidateSide: preferredSide, candidateFrames };
  })();

  const stableSide = next.stableSide || preferredSide;
  const stableScore = stableSide === "left" ? left.score : right.score;
  const stableLeg = stableSide === "left" ? leftLeg : rightLeg;
  const confidence = confidenceOf(stableScore);
  return {
    tracker: next,
    reading: {
      side: stableSide === "left" ? "运动员左腿" : "运动员右腿",
      sideKey: stableSide,
      confidence,
      readable: confidence >= 52,
      reason: confidence < 52 ? "支撑腿置信度偏低" : "",
      leftScore: left.score,
      rightScore: right.score,
      kneeAngle: calculateAngle(stableLeg.hip, stableLeg.knee, stableLeg.ankle),
    },
  };
}

export function classifyPoseIssue(metrics: {
  readonly kneeAngle: number;
  readonly leanAngle: number;
  readonly pelvisHeight: number;
}): string {
  const issues: string[] = [];
  if (metrics.kneeAngle > 115) issues.push("支撑膝角度偏大");
  if (metrics.leanAngle > 52) issues.push("身体倾角偏大");
  if (metrics.pelvisHeight > 62) issues.push("骨盆高度偏高");
  if (!issues.length) issues.push("姿态可接受");
  return issues.join(" / ");
}

export function landmarksFromPoints(
  points: Readonly<Record<string, PlanePoint>> | null,
): (PlanePoint | null)[] | null {
  if (!points) return null;
  const landmarks: (PlanePoint | null)[] = Array.from({ length: 33 }, () => null);
  for (const [index, point] of Object.entries(points)) {
    landmarks[Number(index)] = point;
  }
  return landmarks;
}

export function getPoseCom(landmarks: readonly (PlanePoint | null)[]): PlanePoint | null {
  const lShoulder = landmarks[11];
  const rShoulder = landmarks[12];
  const lHip = landmarks[23];
  const rHip = landmarks[24];
  if (!lShoulder || !rShoulder || !lHip || !rHip) return null;
  const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
  const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
  const hipMidX = (lHip.x + rHip.x) / 2;
  const hipMidY = (lHip.y + rHip.y) / 2;
  return { x: (shoulderMidX + hipMidX) / 2, y: (shoulderMidY + hipMidY) / 2 };
}

export function acceptTrackedCom(
  state: TrackingState,
  nextCom: PlanePoint | null,
): { readonly state: TrackingState; readonly accepted: boolean } {
  if (!nextCom || !Number.isFinite(nextCom.x) || !Number.isFinite(nextCom.y)) {
    return { state, accepted: false };
  }
  let next = state;
  if (state.lastTargetCom) {
    const jump = Math.hypot(nextCom.x - state.lastTargetCom.x, nextCom.y - state.lastTargetCom.y);
    const maxJump =
      state.manualTargetWarmupFrames > 0
        ? LEGACY_POSE_LIMITS.manualLockMaxJump
        : LEGACY_POSE_LIMITS.comMaxJump;
    if (jump > maxJump) {
      const poseJumpRejectCount = state.poseJumpRejectCount + 1;
      if (poseJumpRejectCount <= LEGACY_POSE_LIMITS.targetReacquireAfter) {
        return { state: { ...state, poseJumpRejectCount }, accepted: false };
      }
      next = {
        ...state,
        poseJumpRejectCount,
        lastTargetCom: null,
        smoothedCom: null,
        manualTargetWarmupFrames: 0,
      };
    }
  }
  const lastTargetCom = next.lastTargetCom
    ? {
        x: next.lastTargetCom.x + (nextCom.x - next.lastTargetCom.x) * LEGACY_POSE_LIMITS.targetSmoothing,
        y: next.lastTargetCom.y + (nextCom.y - next.lastTargetCom.y) * LEGACY_POSE_LIMITS.targetSmoothing,
      }
    : nextCom;
  return {
    accepted: true,
    state: {
      ...next,
      poseJumpRejectCount: 0,
      manualTargetWarmupFrames:
        next.manualTargetWarmupFrames > 0 ? next.manualTargetWarmupFrames - 1 : 0,
      lastTargetCom,
    },
  };
}

export function leanAngleDegrees(landmarks: readonly (PlanePoint | null)[]): number | null {
  const lShoulder = landmarks[11];
  const rShoulder = landmarks[12];
  const lHip = landmarks[23];
  const rHip = landmarks[24];
  if (!lShoulder || !rShoulder || !lHip || !rHip) return null;
  const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
  const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
  const hipMidX = (lHip.x + rHip.x) / 2;
  const hipMidY = (lHip.y + rHip.y) / 2;
  const leanRadians = Math.atan2(hipMidY - shoulderMidY, hipMidX - shoulderMidX);
  return Math.abs(Math.round((leanRadians * 180) / Math.PI) - 90);
}

export function pelvisHeightPercent(landmarks: readonly (PlanePoint | null)[]): string | null {
  const lHip = landmarks[23];
  const rHip = landmarks[24];
  if (!lHip || !rHip) return null;
  return (((lHip.y + rHip.y) / 2) * 100).toFixed(1);
}

const REQUIRED_LANDMARKS = [11, 12, 23, 24, 25, 26, 27, 28] as const;

export interface PoseFrameInput {
  readonly landmarks: readonly (PlanePoint | null)[] | null;
  readonly keyframePending: boolean;
}

export interface PoseFrameMetrics {
  readonly readable: boolean;
  readonly unreadableReason: "no-pose" | "occlusion-or-jump" | "support-leg-uncertain" | "keypoint-missing" | null;
  readonly kneeDisplay: string;
  readonly leanDisplay: string;
  readonly pelvisDisplay: string;
  readonly recoveryDisplay: string;
  readonly keyframeText: string | null;
  readonly liveHoldText: string | null;
  readonly issue: string | null;
  readonly kneeAngle: number | null;
  readonly leanAngle: number | null;
  readonly supportSide: string | null;
  readonly supportConfidence: number | null;
}

export function interpretPoseFrame(
  tracking: TrackingState,
  support: SupportTracker,
  frame: PoseFrameInput,
): {
  readonly tracking: TrackingState;
  readonly support: SupportTracker;
  readonly metrics: PoseFrameMetrics;
} {
  const blank = {
    readable: false,
    kneeDisplay: "--°",
    leanDisplay: "--°",
    pelvisDisplay: "--%",
    recoveryDisplay: "--",
    liveHoldText: null,
    issue: null,
    kneeAngle: null,
    leanAngle: null,
    supportSide: null,
    supportConfidence: null,
  } as const;

  if (!frame.landmarks) {
    return {
      tracking,
      support,
      metrics: {
        ...blank,
        unreadableReason: "no-pose",
        keyframeText: frame.keyframePending ? "当前帧没有稳定骨架，目标不可判读。" : null,
      },
    };
  }

  if (!REQUIRED_LANDMARKS.every((index) => frame.landmarks?.[index])) {
    return {
      tracking,
      support,
      metrics: {
        ...blank,
        unreadableReason: "keypoint-missing",
        keyframeText: frame.keyframePending ? "当前帧关键点缺失或计算失败，目标不可判读。" : null,
      },
    };
  }

  const landmarks = frame.landmarks;
  const tracked = acceptTrackedCom(tracking, getPoseCom(landmarks));
  if (!tracked.accepted) {
    return {
      tracking: tracked.state,
      support,
      metrics: {
        ...blank,
        unreadableReason: "occlusion-or-jump",
        liveHoldText: "检测结果突然跳离当前运动员，已暂时忽略这一帧。",
        keyframeText: frame.keyframePending ? "遮挡、多人重叠或目标跳变，当前帧不可判读。" : null,
      },
    };
  }

  const lHip = landmarks[23]!;
  const rHip = landmarks[24]!;
  const lKnee = landmarks[25]!;
  const rKnee = landmarks[26]!;
  const lAnkle = landmarks[27]!;
  const rAnkle = landmarks[28]!;
  const hipMidX = (lHip.x + rHip.x) / 2;
  const picked = pickSupportLeg(
    { hip: lHip, knee: lKnee, ankle: lAnkle },
    { hip: rHip, knee: rKnee, ankle: rAnkle },
    hipMidX,
    support,
  );
  const supportReadable = picked.reading.readable && picked.reading.confidence >= 52;
  const lean = leanAngleDegrees(landmarks);
  const pelvis = pelvisHeightPercent(landmarks);
  if (lean === null || pelvis === null) {
    return {
      tracking: tracked.state,
      support: picked.tracker,
      metrics: {
        ...blank,
        unreadableReason: "keypoint-missing",
        keyframeText: frame.keyframePending ? "当前帧关键点缺失或计算失败，目标不可判读。" : null,
      },
    };
  }
  if (!supportReadable) {
    return {
      tracking: tracked.state,
      support: picked.tracker,
      metrics: {
        readable: false,
        unreadableReason: "support-leg-uncertain",
        kneeDisplay: "--°",
        leanDisplay: `${lean}°`,
        pelvisDisplay: `${pelvis}%`,
        recoveryDisplay: "0",
        liveHoldText: null,
        issue: null,
        kneeAngle: null,
        leanAngle: lean,
        supportSide: picked.reading.side,
        supportConfidence: picked.reading.confidence,
        keyframeText: frame.keyframePending
          ? picked.reading.reason || "支撑腿不确定，当前帧不可判读。"
          : null,
      },
    };
  }

  const issue = classifyPoseIssue({
    kneeAngle: picked.reading.kneeAngle,
    leanAngle: lean,
    pelvisHeight: Number(pelvis),
  });
  return {
    tracking: tracked.state,
    support: picked.tracker,
    metrics: {
      readable: true,
      unreadableReason: null,
      kneeDisplay: `${picked.reading.kneeAngle}°`,
      leanDisplay: `${lean}°`,
      pelvisDisplay: `${pelvis}%`,
      recoveryDisplay: "0",
      keyframeText: null,
      liveHoldText: null,
      issue,
      kneeAngle: picked.reading.kneeAngle,
      leanAngle: lean,
      supportSide: picked.reading.side,
      supportConfidence: picked.reading.confidence,
    },
  };
}

export function shouldSendPoseFrame(input: {
  readonly nowMs: number;
  readonly lastPoseFrameAt: number;
  readonly inFlight: boolean;
}): boolean {
  if (input.inFlight) return false;
  return input.nowMs - input.lastPoseFrameAt >= LEGACY_POSE_LIMITS.frameIntervalMs;
}

export function assessVideoInput(input: {
  readonly byteLength: number;
  readonly decodable: boolean;
}): {
  readonly poseInvoked: boolean;
  readonly uploadedBytes: number;
  readonly analyzeEnabled: boolean;
  readonly buttonLabel: string;
} {
  const usable = input.byteLength > 0 && input.decodable;
  return {
    poseInvoked: false,
    uploadedBytes: 0,
    analyzeEnabled: usable,
    buttonLabel: usable ? "启动 Edge 视觉引擎分析" : "请先上传视频",
  };
}

export interface AnalysisSessionState {
  readonly started: boolean;
  readonly objectUrl: string | null;
  readonly keyframes: readonly { readonly id: string }[];
  readonly kneeDisplay: string;
  readonly leanDisplay: string;
  readonly pelvisDisplay: string;
  readonly recoveryDisplay: string;
  readonly poseInstanceOpen: boolean;
}

export function resetAnalysisSession(state: AnalysisSessionState): {
  readonly playbackStopped: true;
  readonly objectUrlRevoked: boolean;
  readonly keyframes: readonly [];
  readonly kneeDisplay: "--°";
  readonly leanDisplay: "--°";
  readonly pelvisDisplay: "--%";
  readonly recoveryDisplay: "--";
  readonly supportHint: "评分制识别支撑腿";
  readonly analyzeEnabled: false;
  readonly buttonLabel: "请先上传视频";
  readonly poseClosed: false;
  readonly poseInstanceOpen: boolean;
} {
  return {
    playbackStopped: true,
    objectUrlRevoked: state.objectUrl !== null,
    keyframes: [],
    kneeDisplay: "--°",
    leanDisplay: "--°",
    pelvisDisplay: "--%",
    recoveryDisplay: "--",
    supportHint: "评分制识别支撑腿",
    analyzeEnabled: false,
    buttonLabel: "请先上传视频",
    poseClosed: false,
    poseInstanceOpen: state.poseInstanceOpen,
  };
}
