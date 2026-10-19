import { describe, expect, it } from "vitest";

import { emptySupportTracker, emptyTrackingState, landmarksFromPoints } from "./legacy-pose";
import { buildBiomechAnalysisRecord } from "./biomech-record";
import {
  aggregateKeyframes,
  analysisCrop,
  appendKeyframe,
  MAX_POSE_KEYFRAMES,
  poseSendSize,
  samplePoseFrame,
} from "./biomech-session";

const readablePoints = {
  11: { x: 0.42, y: 0.2, visibility: 0.9 },
  12: { x: 0.58, y: 0.2, visibility: 0.9 },
  23: { x: 0.44, y: 0.5, visibility: 0.9 },
  24: { x: 0.56, y: 0.5, visibility: 0.9 },
  25: { x: 0.46, y: 0.7, visibility: 0.9 },
  26: { x: 0.6, y: 0.72, visibility: 0.9 },
  27: { x: 0.48, y: 0.9, visibility: 0.9 },
  28: { x: 0.62, y: 0.92, visibility: 0.9 },
};

describe("biomechanics sampling", () => {
  it("caps the canvas sent to Pose at 640 on the long side of the crop", () => {
    expect(poseSendSize({ width: 1280, height: 720 })).toEqual({ width: 640, height: 360 });
    expect(poseSendSize({ width: 400, height: 300 })).toEqual({ width: 400, height: 300 });
  });

  it("keeps a wide crop until a target is locked", () => {
    expect(analysisCrop({ locked: false, jumpRejects: 0, target: null }).w).toBe(0.74);
    expect(analysisCrop({ locked: true, jumpRejects: 0, target: { x: 0.2, y: 0.4 } }).w).toBe(0.62);
  });

  it("uses automatic knee on the live frame and the chosen leg only on that sample", () => {
    const landmarks = landmarksFromPoints(readablePoints);
    const automatic = samplePoseFrame({
      tracking: emptyTrackingState(),
      support: emptySupportTracker(),
      landmarks,
      timeSeconds: 1.2,
      supportMode: "auto",
    });
    const manual = samplePoseFrame({
      tracking: emptyTrackingState(),
      support: emptySupportTracker(),
      landmarks,
      timeSeconds: 1.2,
      supportMode: "left",
    });
    expect(manual.live.kneeAngle).toBe(automatic.live.kneeAngle);
    expect(manual.support).toEqual(automatic.support);
    expect(manual.sample.manual).toBe(true);
    expect(manual.sample.supportSide).toBe("left");
    expect(automatic.sample.manual).toBe(false);
  });

  it("averages readable frames and drops nothing from the stored list", () => {
    const readable = samplePoseFrame({
      tracking: emptyTrackingState(),
      support: emptySupportTracker(),
      landmarks: landmarksFromPoints(readablePoints),
      timeSeconds: 2,
      supportMode: "left",
    }).sample;
    const missing = samplePoseFrame({
      tracking: emptyTrackingState(),
      support: emptySupportTracker(),
      landmarks: null,
      timeSeconds: 3,
      supportMode: "auto",
    }).sample;
    const samples = appendKeyframe(appendKeyframe([], readable), missing);
    const aggregate = aggregateKeyframes(samples);
    expect(samples).toHaveLength(2);
    expect(aggregate.readable).toBe(1);
    expect(aggregate.unreadable).toBe(1);
    expect(aggregate.avgKnee).toBe(readable.kneeAngle);
    expect(MAX_POSE_KEYFRAMES).toBe(10);
  });

  it("saves lindsay, an ISO timestamp, the pose parameter block, and the sampled frames", () => {
    const sample = samplePoseFrame({
      tracking: emptyTrackingState(),
      support: emptySupportTracker(),
      landmarks: landmarksFromPoints(readablePoints),
      timeSeconds: 4.5,
      supportMode: "auto",
    }).sample;
    const record = buildBiomechAnalysisRecord({
      id: "biomech-abc",
      ownerUserId: "user-1",
      createdAt: "2026-10-19T07:00:00.000Z",
      samples: [sample],
    });
    expect(record.athleteId).toBe("lindsay");
    expect(record.createdAt).toBe("2026-10-19T07:00:00.000Z");
    expect(record.provenance.algorithmVersion).toBe("legacy-biomech-port-1");
    expect(record.provenance.model).toMatchObject({
      modelVersion: "mediapipe-pose@0.5.1675469404",
      modelComplexity: 1,
      smoothLandmarks: true,
      poseFrameIntervalMs: 180,
      maxAnalysisEdgePx: 640,
    });
    expect(record.poseFrames[0]?.timeSeconds).toBe(4.5);
    expect(record.poseFrames[0]?.readable).toBe(sample.readable);
    expect(record).not.toHaveProperty("pace");
  });
});
