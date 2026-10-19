import { buildEquipmentHistoryRecord, type EquipmentHistoryRecord } from "@skatingx/skating-domain";
import { describe, expect, it } from "vitest";

import { equipmentArchiveKey, mergeEquipmentHistory, rememberEquipmentRecord } from "./equipment-archive";

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function record(id: string, createdAt: string): EquipmentHistoryRecord {
  return buildEquipmentHistoryRecord({
    id,
    ownerUserId: "user-1",
    createdAt,
    symptomKey: "slide",
    symptomText: "",
    height: "",
    weight: "40",
    bladeLength: "",
    leftRocker: [],
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

describe("equipment browser archive", () => {
  it("lets a newer cloud copy replace the same local id", () => {
    const local = record("equip-1", "2026-10-19T06:00:00.000Z");
    const cloud = { ...record("equip-1", "2026-10-19T06:00:00.000Z"), weight: "41" };
    const merged = mergeEquipmentHistory([cloud], [local]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.weight).toBe("41");
  });

  it("stores under a skatingx key, not the legacy archive key", () => {
    const storage = memory();
    rememberEquipmentRecord(storage, "user-1", record("equip-1", "2026-10-19T06:00:00.000Z"));
    expect(storage.getItem(equipmentArchiveKey("user-1"))).toContain("equip-1");
    expect(storage.getItem("blaze-equipment-history-v1")).toBeNull();
  });
});