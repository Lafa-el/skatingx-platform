import { buildEquipmentHistoryRecord, type EquipmentHistoryRecord } from "@skatingx/skating-domain";
import { describe, expect, it } from "vitest";

import { compareEquipmentRecords } from "./equipment-compare";

function record(id: string, createdAt: string, center: string, point = 0): EquipmentHistoryRecord {
  return buildEquipmentHistoryRecord({
    id,
    ownerUserId: "user-1",
    createdAt,
    symptomKey: "slide",
    symptomText: "",
    height: "",
    weight: "40",
    bladeLength: "",
    leftRocker: [{ point, value: center }],
    rightRocker: [],
    offsets: { leftFront: "", leftRear: "", rightFront: "", rightRear: "" },
    bend: { front: "", middle: "", rear: "" },
    adjustmentType: "unchanged",
    feedbackRating: "not-skated",
    adjustmentNotes: "",
    missingCore: false,
    ruleHints: [],
  });
}

describe("compareEquipmentRecords", () => {
  it("reports a rocker change of 4 ticks or more, using the earlier record as the baseline", () => {
    const lines = compareEquipmentRecords(
      "zh",
      record("equip-2", "2026-10-19T08:00:00.000Z", "16"),
      record("equip-1", "2026-10-19T06:00:00.000Z", "10"),
      () => "记录未调整",
      () => "未上冰验证",
    );
    expect(lines.some((line) => line.includes("0: +6"))).toBe(true);
    expect(lines[1]).toContain("记录未调整");
  });
});

  it("a change at ±9 or ±10 is reported; ±8 stays on the previous range", () => {
    const lines = (point: number, older: string, newer: string) =>
      compareEquipmentRecords(
        "zh",
        record("equip-2", "2026-10-19T08:00:00.000Z", newer, point),
        record("equip-1", "2026-10-19T06:00:00.000Z", older, point),
        () => "记录未调整",
        () => "未上冰验证",
      );
    expect(lines(9, "10", "16").some((line) => line.includes("+9: +6"))).toBe(true);
    expect(lines(-10, "10", "16").some((line) => line.includes("-10: +6"))).toBe(true);
    expect(lines(8, "10", "16").some((line) => line.includes("+8: +6"))).toBe(true);
  });

