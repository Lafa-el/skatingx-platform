/**
 * Behavior port of `calculatePacingAnalysis` in blaze-skate-analysis `index.html`.
 * Numeric inputs only. No chart and no DOM.
 */

export const pacingDistanceConfigs = {
  "500": {
    title: "500m",
    labels: ["起跑前半圈", "Lap 1", "Lap 2", "Lap 3", "Lap 4"],
    defaults: [8.0, 10.3, 10.4, 10.5, 10.8],
    focus: "起跑、前半程速度、末圈衰减",
  },
  "777": {
    title: "777m",
    labels: ["起跑圈", "第1圈", "第2圈", "第3圈", "第4圈", "第5圈", "冲刺圈"],
    defaults: [13.8, 10.5, 10.6, 10.7, 10.9, 11.2, 12.3],
    focus: "中距离节奏、弯道效率、后半程姿态保持",
  },
  "1000": {
    title: "1000m",
    labels: ["起跑圈", "第1圈", "第2圈", "第3圈", "第4圈", "第5圈", "第6圈", "第7圈", "冲刺圈"],
    defaults: [14.1, 11.6, 11.6, 11.6, 11.5, 11.3, 11.1, 11.3, 10.9],
    focus: "有氧-无氧衔接、配速稳定性、末段抗疲劳",
  },
} as const;

export type PaceDistance = keyof typeof pacingDistanceConfigs;

export const PACE_ALGORITHM_VERSION = "legacy-pace-port-1" as const;

export interface PaceAnalysis {
  readonly ratingLabel: "优秀" | "需强化" | "稳定中等";
  readonly levelSub: string;
  readonly trainingRatio: "60:40" | "45:55" | "55:45";
  readonly lacticIndexPercent: number;
  readonly totalSeconds: number;
  readonly benchmarkTotalSeconds: number;
  readonly decayPercent: number;
  readonly benchmarkDecayPercent: number;
  readonly earlyAverageSeconds: number;
  readonly lateAverageSeconds: number;
  readonly maxSegmentJump: number;
  readonly benchmarkMaxJump: number;
  readonly finishGapSeconds: number;
}

export type PaceResult =
  | { readonly ok: false; readonly message: "请输入完整且大于 0 的圈速数据后再生成曲线。" | "请先填写完整且大于 0 的 Junior D 标准，再生成曲线。" }
  | { readonly ok: true; readonly analysis: PaceAnalysis };

function positive(values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value) && value > 0);
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function calculatePacingAnalysis(
  distance: PaceDistance,
  splits: readonly number[],
  benchmark: readonly number[],
): PaceResult {
  if (!positive(splits)) {
    return { ok: false, message: "请输入完整且大于 0 的圈速数据后再生成曲线。" };
  }
  if (!positive(benchmark)) {
    return { ok: false, message: "请先填写完整且大于 0 的 Junior D 标准，再生成曲线。" };
  }

  const mainSegments = distance === "500" ? splits.slice(1) : splits.slice(1, -1);
  const benchmarkMainSegments = distance === "500" ? benchmark.slice(1) : benchmark.slice(1, -1);
  const earlyAvg = average(mainSegments.slice(0, Math.min(2, mainSegments.length)));
  const lateAvg = average(mainSegments.slice(Math.max(0, mainSegments.length - 2)));
  const benchmarkEarlyAvg = average(benchmarkMainSegments.slice(0, Math.min(2, benchmarkMainSegments.length)));
  const benchmarkLateAvg = average(
    benchmarkMainSegments.slice(Math.max(0, benchmarkMainSegments.length - 2)),
  );
  const decayPercent = ((lateAvg - earlyAvg) / earlyAvg) * 100;
  const benchmarkDecayPercent = ((benchmarkLateAvg - benchmarkEarlyAvg) / benchmarkEarlyAvg) * 100;
  const segmentJumps = mainSegments.slice(1).map((value, index) => value - mainSegments[index]);
  const maxSegmentJump = segmentJumps.length ? Math.max(...segmentJumps) : 0;
  const benchmarkJumps = benchmarkMainSegments
    .slice(1)
    .map((value, index) => value - benchmarkMainSegments[index]);
  const benchmarkMaxJump = benchmarkJumps.length ? Math.max(...benchmarkJumps) : 0;
  const decayPenalty = Math.max(0, decayPercent - benchmarkDecayPercent) * 4;
  const jumpPenalty = Math.max(0, maxSegmentJump - benchmarkMaxJump) * 8;
  const lacticIndex = Math.max(0, Math.min(100, 100 - decayPenalty - jumpPenalty));
  const totalSeconds = splits.reduce((sum, value) => sum + value, 0);
  const benchmarkTotalSeconds = benchmark.reduce((sum, value) => sum + value, 0);
  const finishGapSeconds = splits[splits.length - 1] - benchmark[benchmark.length - 1];

  let ratingLabel: PaceAnalysis["ratingLabel"] = "优秀";
  let levelSub = "后半程节奏接近标杆";
  let trainingRatio: PaceAnalysis["trainingRatio"] = "60:40";
  if (
    decayPercent > benchmarkDecayPercent + 7 ||
    maxSegmentJump > benchmarkMaxJump + 0.8 ||
    finishGapSeconds > 0.7
  ) {
    ratingLabel = "需强化";
    levelSub = "后半程掉速明显，优先补节奏耐受";
    trainingRatio = "45:55";
  } else if (
    decayPercent > benchmarkDecayPercent + 3 ||
    maxSegmentJump > benchmarkMaxJump + 0.35 ||
    finishGapSeconds > 0.35
  ) {
    ratingLabel = "稳定中等";
    levelSub = "中后程开始出现可见波动";
    trainingRatio = "55:45";
  }

  return {
    ok: true,
    analysis: {
      ratingLabel,
      levelSub,
      trainingRatio,
      lacticIndexPercent: Math.round(lacticIndex),
      totalSeconds,
      benchmarkTotalSeconds,
      decayPercent,
      benchmarkDecayPercent,
      earlyAverageSeconds: earlyAvg,
      lateAverageSeconds: lateAvg,
      maxSegmentJump,
      benchmarkMaxJump,
      finishGapSeconds,
    },
  };
}
