import { describe, expect, it } from "vitest";

import { buildEquipmentHistoryRecord } from "./equipment-record";

describe("equipment history record", () => {
  it("keeps the athlete, the ISO time, and the contract provenance, and stores no video", () => {
    const record = buildEquipmentHistoryRecord({
      id: "equip-1",
      ownerUserId: "user-1",
      createdAt: "2026-10-19T06:00:00.000Z",
      symptomKey: "boot-out",
      symptomText: "入弯或弯中出现 Boot out / 鞋帮蹭冰。",
      height: "150",
      weight: "40.00000000000001",
      bladeLength: "15",
      leftRocker: [{ point: 0, value: "12" }],
      rightRocker: [],
      offsets: { leftFront: "2", leftRear: "", rightFront: "", rightRear: "" },
      bend: { front: "", middle: "", rear: "" },
      adjustmentType: "unchanged",
      feedbackRating: "not-skated",
      adjustmentNotes: "",
      missingCore: false,
      ruleHints: ["当前已填数据未触发明显异常规则。建议保存本次记录，结合上冰反馈做调整前后对比。"],
    });

    expect(record.athleteId).toBe("lindsay");
    expect(record.createdAt).toBe("2026-10-19T06:00:00.000Z");
    expect(record.updatedAt).toBe(record.createdAt);
    expect(record.weight).toBe("40.00000000000001");
    expect(record.provenance).toMatchObject({
      schemaVersion: "skatingx-analysis-contract-v1",
      algorithmVersion: "legacy-equipment-port-1",
      model: { modelVersion: "mediapipe-pose@0.5.1675469404", modelVariant: "pose_landmark_full" },
    });
    expect(record.findings).toEqual([{ code: "equipment.symptom.boot-out", analysisId: "equip-1" }]);
    expect(JSON.stringify(record)).not.toContain("video");
    expect(Object.keys(record)).not.toContain("poseFrames");
  });
});
