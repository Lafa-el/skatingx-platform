import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildEquipmentChecklist, parseGaugeNumber } from "./legacy-equipment";
import { calculatePacingAnalysis } from "./legacy-pace";

/** The 500m benchmark this file was locked against. It is not the current factory default. */
const locked500Benchmark = [7.05, 9.1, 9.42, 9.85, 10.3];
import {
  assessVideoInput,
  emptySupportTracker,
  emptyTrackingState,
  interpretPoseFrame,
  landmarksFromPoints,
  LEGACY_POSE_LIMITS,
  resetAnalysisSession,
  shouldSendPoseFrame,
  type PlanePoint,
} from "./legacy-pose";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

function loadFixture(name: string): {
  id: string;
  containsRealVideo: boolean;
  containsProductionRecord: boolean;
  input: Record<string, unknown>;
} {
  return loadJson(name) as {
    id: string;
    containsRealVideo: boolean;
    containsProductionRecord: boolean;
    input: Record<string, unknown>;
  };
}

function assertDeidentified(name: string) {
  const fixture = loadFixture(name);
  expect(fixture.containsRealVideo).toBe(false);
  expect(fixture.containsProductionRecord).toBe(false);
  expect(JSON.stringify(fixture.input)).not.toMatch(/lindsay|firestore/i);
  return fixture;
}

describe("de-identified analysis fixtures", () => {
  it("locks input failure", () => {
    const fixture = assertDeidentified("fx-input-failure.json");
    const input = fixture.input as { byteLength: number; decodable: boolean };
    expect(assessVideoInput(input)).toEqual(loadJson("fx-input-failure.expected.json"));
  });

  it("locks a frame with no person", () => {
    const fixture = assertDeidentified("fx-no-person.json");
    const input = fixture.input as { keyframePending: boolean; landmarks: null };
    const result = interpretPoseFrame(emptyTrackingState(), emptySupportTracker(), {
      landmarks: input.landmarks,
      keyframePending: input.keyframePending,
    });
    expect(result.metrics).toEqual(loadJson("fx-no-person.expected.json"));
  });

  it("locks a one-person jump as an unreadable multi-person frame", () => {
    const fixture = assertDeidentified("fx-multi-person.json");
    const input = fixture.input as {
      returnedPersonCount: number;
      frames: { keyframePending: boolean; points: Record<string, PlanePoint> }[];
    };
    let tracking = emptyTrackingState();
    let support = emptySupportTracker();
    const first = interpretPoseFrame(tracking, support, {
      landmarks: landmarksFromPoints(input.frames[0].points),
      keyframePending: input.frames[0].keyframePending,
    });
    tracking = first.tracking;
    support = first.support;
    const second = interpretPoseFrame(tracking, support, {
      landmarks: landmarksFromPoints(input.frames[1].points),
      keyframePending: input.frames[1].keyframePending,
    });
    expect({
      returnedPersonCount: input.returnedPersonCount,
      comMaxJump: LEGACY_POSE_LIMITS.comMaxJump,
      poseJumpRejectCount: second.tracking.poseJumpRejectCount,
      readable: second.metrics.readable,
      unreadableReason: second.metrics.unreadableReason,
      liveHoldText: second.metrics.liveHoldText,
      keyframeText: second.metrics.keyframeText,
      kneeDisplay: second.metrics.kneeDisplay,
    }).toEqual(loadJson("fx-multi-person.expected.json"));
  });

  it("locks low-frame-rate throttling without a new message", () => {
    const fixture = assertDeidentified("fx-low-frame-rate.json");
    const input = fixture.input as {
      frameIntervalMs: number;
      samples: {
        atMs: number;
        sendFails: boolean;
        points?: Record<string, PlanePoint>;
      }[];
    };
    expect(input.frameIntervalMs).toBe(LEGACY_POSE_LIMITS.frameIntervalMs);

    let lastPoseFrameAt = -180;
    let analysisEnded = false;
    const sends: boolean[] = [];
    let readableFrame: ReturnType<typeof interpretPoseFrame> | null = null;
    expect(shouldSendPoseFrame({ nowMs: 180, lastPoseFrameAt: 0, inFlight: true })).toBe(false);

    for (const sample of input.samples) {
      const send = shouldSendPoseFrame({ nowMs: sample.atMs, lastPoseFrameAt, inFlight: false });
      sends.push(send);
      if (!send) continue;
      lastPoseFrameAt = sample.atMs;
      if (sample.sendFails) {
        analysisEnded = false;
        continue;
      }
      readableFrame = interpretPoseFrame(emptyTrackingState(), emptySupportTracker(), {
        landmarks: landmarksFromPoints(sample.points ?? null),
        keyframePending: false,
      });
    }

    expect({
      sends,
      analysisEnded,
      lowFrameRateCopy: null,
      metrics: readableFrame?.metrics,
    }).toEqual(loadJson("fx-low-frame-rate.expected.json"));
  });

  it("locks cancel-midway and closes Pose on reset", () => {
    const fixture = assertDeidentified("fx-cancel-midway.json");
    const input = fixture.input as {
      started: boolean;
      objectUrl: string;
      keyframes: { id: string }[];
      kneeDisplay: string;
      leanDisplay: string;
      pelvisDisplay: string;
      recoveryDisplay: string;
      poseInstanceOpen: boolean;
    };
    expect(input.started).toBe(true);
    expect(input.keyframes).toHaveLength(1);
    expect(resetAnalysisSession(input)).toEqual(loadJson("fx-cancel-midway.expected.json"));
  });
});

describe("legacy pace calculation", () => {
  it("locks the 500m decay rating for a synthetic split", () => {
    const result = calculatePacingAnalysis(
      "500",
      [7.2, 9.3, 9.5, 10.4, 11.2],
      locked500Benchmark,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.ratingLabel).toBe("需强化");
    expect(result.analysis.trainingRatio).toBe("45:55");
    expect(result.analysis.levelSub).toBe("后半程掉速明显，优先补节奏耐受");
    expect(result.analysis.lacticIndexPercent).toBe(72);
    expect(result.analysis.totalSeconds).toBeCloseTo(47.6, 5);
    expect(result.analysis.benchmarkTotalSeconds).toBeCloseTo(45.72, 5);
    expect(result.analysis.finishGapSeconds).toBeCloseTo(0.9, 5);
    expect(result.analysis.decayPercent).toBeCloseTo(14.893617, 4);
    expect(result.analysis.benchmarkDecayPercent).toBeCloseTo(8.801296, 4);
  });

  it("locks the empty-input failures", () => {
    expect(calculatePacingAnalysis("500", [0, 9.1, 9.4, 9.8, 10.3], locked500Benchmark)).toEqual({
      ok: false,
      message: "请输入完整且大于 0 的圈速数据后再生成曲线。",
    });
    expect(calculatePacingAnalysis("500", [7.2, 9.3, 9.5, 10.4, 11.2], [0, 0, 0, 0, 0])).toEqual({
      ok: false,
      message: "请先填写完整且大于 0 的 Junior D 标准，再生成曲线。",
    });
  });
});

describe("legacy equipment checklist", () => {
  it("locks the rule hints for a synthetic gauge card", () => {
    const checklist = buildEquipmentChecklist({
      weightRaw: "32",
      leftReadings: [
        { point: 0, value: "20" },
        { point: 1, value: "10" },
      ],
      rightReadings: [
        { point: 0, value: "20" },
        { point: 1, value: "20" },
      ],
      offsets: {
        leftFront: "内2mm",
        leftRear: "内5mm",
        rightFront: "内2mm",
        rightRear: "内2mm",
      },
      bend: { front: "18", middle: "22", rear: "30" },
    });
    expect(parseGaugeNumber("内2mm")).toBe(2);
    expect(checklist.missingCore).toBe(false);
    expect(checklist.badgeLabel).toBe("可提交教练复核");
    expect(checklist.actionValue).toBe("左右脚曲线待复核");
    expect(checklist.hints).toEqual([
      "左脚刀头 +1 读数低于前一测点，建议复测是否量具角度或接触点偏了。",
      "左右脚 +1 点相差 10 ticks，建议复核左右脚弧度一致性。",
      "左脚前后 Offset 相差 3mm，建议检查刀架是否存在前后扭斜。",
      "左右脚后点 Offset 相差 3mm，建议确认是否为刻意设定。",
      "Bend 三段最大差为 12 ticks，建议复核压弯是否过于集中在某一段。",
    ]);
  });

  it("locks the incomplete checklist", () => {
    const checklist = buildEquipmentChecklist({
      weightRaw: "",
      leftReadings: [],
      rightReadings: [],
      offsets: { leftFront: "", leftRear: "", rightFront: "", rightRear: "" },
      bend: { front: "", middle: "", rear: "" },
    });
    expect(checklist.missingCore).toBe(true);
    expect(checklist.badgeLabel).toBe("记录不完整");
    expect(checklist.actionValue).toBe("补全曲线/体重");
    expect(checklist.hints).toEqual([
      "左脚缺少中心点 0 读数，无法判断曲线是否从中心平顺展开。",
      "右脚缺少中心点 0 读数，无法判断曲线是否从中心平顺展开。",
    ]);
  });
});
