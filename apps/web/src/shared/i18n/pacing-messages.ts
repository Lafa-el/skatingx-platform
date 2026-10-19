import type { PaceDistance } from "@skatingx/skating-domain";

import { createTranslator, type Locale, type Resources } from "./translator";

/**
 * Pacing tab copy. Chinese strings follow docs/migration/analysis/copy-zh.md.
 * One colon is full-width here (`分段结构：`) because the rest of the app rejects a
 * half-width colon next to Chinese; the legacy page used a half-width colon.
 *
 * English values are drafts for this slice and are 待评审. They are not an approved translation.
 */
const zh = {
  "pace.intro.title": "Junior D 配速衰减分析",
  "pace.intro.body":
    "支持 500m、777m、1000m 三个 Junior D 距离。500m 记录起跑前半圈；777m 和 1000m 从起跑圈开始记录。",
  "pace.distance.group": "距离",
  "pace.distance.500": "500m",
  "pace.distance.777": "777m",
  "pace.distance.1000": "1000m",
  "pace.action.generate": "生成配速衰减曲线",
  "pace.action.resetBenchmark": "恢复默认标准",
  "pace.action.save": "保存本次配速",
  "pace.benchmark.heading": "Junior D 标准编辑",
  "pace.chart.title": "{distance} 配速标杆比对",
  "pace.chart.benchmark": "US Junior D（11-12岁赛季冰龄标杆）",
  "pace.chart.athlete": "Lindsay 的测算配速",
  "pace.chart.axis": "单圈耗时（秒）",
  "pace.chart.waiting": "输入分段后生成配速衰减曲线",
  "pace.chart.canvasBenchmark": "US Junior D 标杆",
  "pace.chart.canvasAthlete": "Lindsay 测算配速",
  "pace.chart.fallbackLine": "{label}：{benchmarkName} {benchmark}s，{athleteName} {athlete}s",
  "pace.badge": "TARGET: US Junior D",
  "pace.empty": "请在左侧选择距离并填写实际分段，然后点击“生成配速衰减曲线”进行分析。",
  "pace.metric.stability": "节奏稳定指数",
  "pace.metric.stabilityHint": "后段衰减越低越好",
  "pace.metric.rating": "配速评级",
  "pace.metric.waiting": "等待测算...",
  "pace.metric.ratio": "推荐训练侧重",
  "pace.metric.ratioHint": "基于距离与后段衰减",
  "pace.report.heading": "配速衰减归因报告",
  "pace.report.body":
    "{title} 分段结构：{pattern}。总成绩 {total}s，比 Junior D 标杆{gapWord} {gap}s。主滑圈段前段均速 {early}s，后段均速 {late}s，后段衰减 {decay}%，标杆衰减 {benchmarkDecay}%。",
  "pace.report.slower": "慢",
  "pace.report.faster": "快",
  "pace.advice.reinforce":
    " 建议下一阶段围绕 {focus}，加入分段追速、弯道姿态保持和短间歇乳酸耐受组合。",
  "pace.advice.steady":
    " 建议保留技术质量训练，同时增加 {title} 的中后段控速与冲刺前姿态稳定练习。",
  "pace.advice.excellent":
    " 当前衰减控制良好，可以把训练重点放在起跑进入、弯道速度保持和末段冲刺质量。",
  "pace.rating.excellent": "优秀",
  "pace.rating.reinforce": "需强化",
  "pace.rating.steady": "稳定中等",
  "pace.level.excellent": "后半程节奏接近标杆",
  "pace.level.reinforce": "后半程掉速明显，优先补节奏耐受",
  "pace.level.steady": "中后程开始出现可见波动",
  "pace.focus.500": "起跑、前半程速度、末圈衰减",
  "pace.focus.777": "中距离节奏、弯道效率、后半程姿态保持",
  "pace.focus.1000": "有氧-无氧衔接、配速稳定性、末段抗疲劳",
  "pace.error.splits": "请输入完整且大于 0 的圈速数据后再生成曲线。",
  "pace.error.benchmark": "请先填写完整且大于 0 的 Junior D 标准，再生成曲线。",
  "pace.error.signedOut": "请先登录后再保存。",
  "pace.error.unavailable": "分析记录暂时无法保存。",
  "pace.error.save": "保存没有完成，请再试一次。",
  "pace.saved": "已保存到你的分析记录。",
  "pace.input.unit": "{label} (s)",
  "pace.segment.500.startHalf": "起跑前半圈",
  "pace.segment.500.lap1": "Lap 1",
  "pace.segment.500.lap2": "Lap 2",
  "pace.segment.500.lap3": "Lap 3",
  "pace.segment.500.lap4": "Lap 4",
  "pace.segment.777.startLap": "起跑圈",
  "pace.segment.777.lap1": "第1圈",
  "pace.segment.777.lap2": "第2圈",
  "pace.segment.777.lap3": "第3圈",
  "pace.segment.777.lap4": "第4圈",
  "pace.segment.777.lap5": "第5圈",
  "pace.segment.777.sprint": "冲刺圈",
  "pace.segment.1000.startLap": "起跑圈",
  "pace.segment.1000.lap1": "第1圈",
  "pace.segment.1000.lap2": "第2圈",
  "pace.segment.1000.lap3": "第3圈",
  "pace.segment.1000.lap4": "第4圈",
  "pace.segment.1000.lap5": "第5圈",
  "pace.segment.1000.lap6": "第6圈",
  "pace.segment.1000.lap7": "第7圈",
  "pace.segment.1000.sprint": "冲刺圈",
} as const;

type PaceKey = keyof typeof zh;

const en: Record<PaceKey, string> = {
  "pace.intro.title": "Junior D pace-decay analysis",
  "pace.intro.body":
    "Three Junior D distances: 500m, 777m, and 1000m. 500m starts with the opening half-lap; 777m and 1000m start with the opening lap.",
  "pace.distance.group": "Distance",
  "pace.distance.500": "500m",
  "pace.distance.777": "777m",
  "pace.distance.1000": "1000m",
  "pace.action.generate": "Generate the pace-decay curve",
  "pace.action.resetBenchmark": "Restore the default benchmark",
  "pace.action.save": "Save this pace run",
  "pace.benchmark.heading": "Edit the Junior D benchmark",
  "pace.chart.title": "{distance} pace versus the benchmark",
  "pace.chart.benchmark": "US Junior D (11–12 season ice-age benchmark)",
  "pace.chart.athlete": "Lindsay's calculated pace",
  "pace.chart.axis": "Lap time (seconds)",
  "pace.chart.waiting": "Enter the splits, then generate the pace-decay curve",
  "pace.chart.canvasBenchmark": "US Junior D benchmark",
  "pace.chart.canvasAthlete": "Lindsay's calculated pace",
  "pace.chart.fallbackLine": "{label}: {benchmarkName} {benchmark}s, {athleteName} {athlete}s",
  "pace.badge": "TARGET: US Junior D",
  "pace.empty":
    "Choose a distance, fill in the actual splits, then choose “Generate the pace-decay curve”.",
  "pace.metric.stability": "Rhythm stability index",
  "pace.metric.stabilityHint": "Lower late-race decay is better",
  "pace.metric.rating": "Pace rating",
  "pace.metric.waiting": "Waiting for the calculation...",
  "pace.metric.ratio": "Suggested training emphasis",
  "pace.metric.ratioHint": "Based on the distance and late-race decay",
  "pace.report.heading": "Pace-decay report",
  "pace.report.body":
    "{title} split structure: {pattern}. Total {total}s, {gap}s {gapWord} than the Junior D benchmark. Early main-lap average {early}s, late average {late}s, late decay {decay}%, benchmark decay {benchmarkDecay}%.",
  "pace.report.slower": "slower",
  "pace.report.faster": "faster",
  "pace.advice.reinforce":
    " Next, centre the block on {focus}: add split chasing, corner posture holds, and short-interval lactate work.",
  "pace.advice.steady":
    " Keep the technical-quality work, and add mid-to-late pace control plus pre-sprint posture holds for {title}.",
  "pace.advice.excellent":
    " Decay is under control. Put the next emphasis on the start entry, holding speed through the corners, and the quality of the final sprint.",
  "pace.rating.excellent": "Strong",
  "pace.rating.reinforce": "Needs more work",
  "pace.rating.steady": "Steady, middle of the range",
  "pace.level.excellent": "The back half stays close to the benchmark",
  "pace.level.reinforce": "The back half fades. Build pace tolerance first",
  "pace.level.steady": "The middle and late laps start to move around",
  "pace.focus.500": "the start, early speed, and last-lap decay",
  "pace.focus.777": "middle-distance rhythm, corner efficiency, and posture in the second half",
  "pace.focus.1000": "the aerobic-anaerobic join, pace stability, and late fatigue resistance",
  "pace.error.splits": "Enter a complete set of lap times, each greater than 0, before generating the curve.",
  "pace.error.benchmark": "Fill in a complete Junior D benchmark, each value greater than 0, before generating the curve.",
  "pace.error.signedOut": "Sign in before saving.",
  "pace.error.unavailable": "This analysis cannot be saved right now.",
  "pace.error.save": "The save did not finish. Try again.",
  "pace.saved": "Saved to your analysis records.",
  "pace.input.unit": "{label} (s)",
  "pace.segment.500.startHalf": "Opening half-lap",
  "pace.segment.500.lap1": "Lap 1",
  "pace.segment.500.lap2": "Lap 2",
  "pace.segment.500.lap3": "Lap 3",
  "pace.segment.500.lap4": "Lap 4",
  "pace.segment.777.startLap": "Opening lap",
  "pace.segment.777.lap1": "Lap 1",
  "pace.segment.777.lap2": "Lap 2",
  "pace.segment.777.lap3": "Lap 3",
  "pace.segment.777.lap4": "Lap 4",
  "pace.segment.777.lap5": "Lap 5",
  "pace.segment.777.sprint": "Sprint lap",
  "pace.segment.1000.startLap": "Opening lap",
  "pace.segment.1000.lap1": "Lap 1",
  "pace.segment.1000.lap2": "Lap 2",
  "pace.segment.1000.lap3": "Lap 3",
  "pace.segment.1000.lap4": "Lap 4",
  "pace.segment.1000.lap5": "Lap 5",
  "pace.segment.1000.lap6": "Lap 6",
  "pace.segment.1000.lap7": "Lap 7",
  "pace.segment.1000.sprint": "Sprint lap",
};

export type PaceMessageKey = PaceKey;

export const pacingResources: Resources<PaceKey> = { zh, en };

export const tPace = createTranslator(pacingResources);

const segmentKeys: Record<PaceDistance, readonly PaceKey[]> = {
  "500": [
    "pace.segment.500.startHalf",
    "pace.segment.500.lap1",
    "pace.segment.500.lap2",
    "pace.segment.500.lap3",
    "pace.segment.500.lap4",
  ],
  "777": [
    "pace.segment.777.startLap",
    "pace.segment.777.lap1",
    "pace.segment.777.lap2",
    "pace.segment.777.lap3",
    "pace.segment.777.lap4",
    "pace.segment.777.lap5",
    "pace.segment.777.sprint",
  ],
  "1000": [
    "pace.segment.1000.startLap",
    "pace.segment.1000.lap1",
    "pace.segment.1000.lap2",
    "pace.segment.1000.lap3",
    "pace.segment.1000.lap4",
    "pace.segment.1000.lap5",
    "pace.segment.1000.lap6",
    "pace.segment.1000.lap7",
    "pace.segment.1000.sprint",
  ],
};

export function paceSegmentLabel(locale: Locale, distance: PaceDistance, index: number): string {
  const key = segmentKeys[distance][index];
  if (!key) {
    throw new Error(`No pacing label for ${distance} at ${index}.`);
  }
  return tPace(locale, key);
}

const focusKey: Record<PaceDistance, PaceKey> = {
  "500": "pace.focus.500",
  "777": "pace.focus.777",
  "1000": "pace.focus.1000",
};

export function paceFocus(locale: Locale, distance: PaceDistance): string {
  return tPace(locale, focusKey[distance]);
}
