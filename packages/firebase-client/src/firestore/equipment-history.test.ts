import { describe, expect, it } from "vitest";

import { equipmentHistoryFromDocument } from "./equipment-history";

const stored = (over: Record<string, unknown> = {}) => ({
  id: "equip-1",
  ownerUserId: "user-1",
  athleteId: "lindsay",
  createdAt: "2026-10-19T06:00:00.000Z",
  symptomKey: "slide",
  findings: [{ code: "equipment.symptom.slide", analysisId: "equip-1" }],
  ...over,
});

describe("equipmentHistoryFromDocument", () => {
  it("passes a valid record through unchanged, findings with their analysisId and order", () => {
    const data = stored({
      findings: [
        { code: "equipment.symptom.slide", analysisId: "equip-1" },
        { code: "equipment.rocker.check", analysisId: "equip-1" },
      ],
    });
    expect(equipmentHistoryFromDocument(data)).toEqual(data);
  });

  it("keeps the other fields as stored", () => {
    const record = equipmentHistoryFromDocument(stored({ weight: "40", note: "x" })) as unknown as Record<string, unknown>;
    expect(record).toMatchObject({ id: "equip-1", ownerUserId: "user-1", weight: "40", note: "x" });
  });

  it("findings that are missing become an empty list", () => {
    const { findings: _removed, ...data } = stored();
    expect(equipmentHistoryFromDocument(data)?.findings).toEqual([]);
  });

  it.each([["a string", "slide"], ["a number", 3], ["an object", { code: "equipment.symptom.slide" }], ["null", null]])(
    "findings that are %s become an empty list",
    (_name, findings) => {
      expect(equipmentHistoryFromDocument(stored({ findings }))?.findings).toEqual([]);
    },
  );

  it("a mixed array keeps only the items with a string code, whole", () => {
    const good = { code: "equipment.symptom.slide", analysisId: "equip-1" };
    const noAnalysisId = { code: "equipment.rocker.check" };
    const record = equipmentHistoryFromDocument(
      stored({ findings: [good, { code: 7, analysisId: "equip-1" }, null, "equipment.symptom.slide", { analysisId: "equip-1" }, noAnalysisId, 4, []] }),
    );
    // An item without an analysisId stays: only `code` is read downstream.
    expect(record?.findings).toEqual([good, noAnalysisId]);
    expect(record?.findings?.[0]).toBe(good);
  });

  it.each([
    ["no id", { id: undefined }],
    ["a numeric id", { id: 5 }],
    ["no createdAt", { createdAt: undefined }],
    ["a numeric createdAt", { createdAt: 1_760_000_000_000 }],
    ["a null createdAt", { createdAt: null }],
  ])("a document with %s is dropped", (_name, over) => {
    expect(equipmentHistoryFromDocument(stored(over))).toBeNull();
  });

  it("a document that is not an object is dropped", () => {
    expect(equipmentHistoryFromDocument(null)).toBeNull();
    expect(equipmentHistoryFromDocument(undefined)).toBeNull();
    expect(equipmentHistoryFromDocument("equip-1")).toBeNull();
  });
});
