import { describe, expect, it } from "vitest";

import { buildEquipmentChecklist, findInvalidEquipmentNumber, parseGaugeNumber } from "./legacy-equipment";

const blankRocker = () => Object.fromEntries(Array.from({ length: 21 }, (_, index) => [String(index - 10), ""]));
const blank = () => ({
  weight: "",
  height: "",
  leftRocker: blankRocker(),
  rightRocker: blankRocker(),
  offsets: { leftFront: "", leftRear: "", rightFront: "", rightRear: "" },
  bend: { front: "", middle: "", rear: "" },
});
type Form = ReturnType<typeof blank>;
const withForm = (change: (form: Form) => void) => {
  const form = blank();
  change(form);
  return findInvalidEquipmentNumber(form);
};

describe("findInvalidEquipmentNumber: plain numbers (weight, height, rocker, bend)", () => {
  it.each(["约12", "abc", "1-2", "12abc", "12kg", "1,5", "--3", ".5", "5."])("%s is not a number", (text) => {
    expect(withForm((form) => (form.weight = text))).toEqual({ field: "weight" });
    expect(withForm((form) => (form.height = text))).toEqual({ field: "height" });
    expect(withForm((form) => (form.leftRocker["3"] = text))).toEqual({ field: "leftRocker", point: 3 });
    expect(withForm((form) => (form.bend.middle = text))).toEqual({ field: "bendMiddle" });
  });

  it.each(["12", "12.5", "-3", "0", "  40  ", "", "   "])("%j is fine (a number, or not filled in)", (text) => {
    expect(withForm((form) => (form.weight = text))).toBeNull();
    expect(withForm((form) => (form.height = text))).toBeNull();
    expect(withForm((form) => (form.rightRocker["-4"] = text))).toBeNull();
    expect(withForm((form) => (form.bend.front = text))).toBeNull();
  });
});

describe("findInvalidEquipmentNumber: offsets", () => {
  it.each(["内2mm", "内侧2mm", "外1mm", "外侧 1.5mm", "inside 2 mm", "Outside2", "2", "2mm", "-1mm", "", "  "])(
    "%j is accepted, as the field promises",
    (text) => {
      expect(withForm((form) => (form.offsets.leftFront = text))).toBeNull();
    },
  );

  it.each(["约2mm", "2mm内", "abc", "内mm", "2 inside", "1-2mm"])("%j is refused", (text) => {
    for (const field of ["leftFront", "leftRear", "rightFront", "rightRear"] as const) {
      expect(withForm((form) => (form.offsets[field] = text))).toEqual({ field });
    }
  });
});

describe("findInvalidEquipmentNumber: which field is reported first", () => {
  it("names the first bad field in the fixed order", () => {
    const form = blank();
    form.bend.rear = "x";
    expect(findInvalidEquipmentNumber(form)).toEqual({ field: "bendRear" });
    form.bend.front = "x";
    expect(findInvalidEquipmentNumber(form)).toEqual({ field: "bendFront" });
    form.offsets.rightRear = "x";
    expect(findInvalidEquipmentNumber(form)).toEqual({ field: "rightRear" });
    form.offsets.leftFront = "x";
    expect(findInvalidEquipmentNumber(form)).toEqual({ field: "leftFront" });
    form.rightRocker["10"] = "x";
    expect(findInvalidEquipmentNumber(form)).toEqual({ field: "rightRocker", point: 10 });
    form.rightRocker["-10"] = "x";
    expect(findInvalidEquipmentNumber(form)).toEqual({ field: "rightRocker", point: -10 });
    form.leftRocker["5"] = "x";
    form.leftRocker["-2"] = "x";
    expect(findInvalidEquipmentNumber(form)).toEqual({ field: "leftRocker", point: -2 });
    form.height = "x";
    expect(findInvalidEquipmentNumber(form)).toEqual({ field: "height" });
    form.weight = "x";
    expect(findInvalidEquipmentNumber(form)).toEqual({ field: "weight" });
  });

  it("an empty form is valid", () => {
    expect(findInvalidEquipmentNumber(blank())).toBeNull();
  });
});

describe("buildEquipmentChecklist: missingCore follows what parses", () => {
  const input = (weightRaw: string) => ({
    weightRaw,
    leftReadings: [{ point: 0, value: "12" }],
    rightReadings: [],
    offsets: { leftFront: "", leftRear: "", rightFront: "", rightRear: "" },
    bend: { front: "", middle: "", rear: "" },
  });

  it("a weight that is not a number is missing, the way the comparison reads it", () => {
    expect(buildEquipmentChecklist(input("abc")).missingCore).toBe(true);
    expect(parseGaugeNumber("abc")).toBeNull();
  });

  it("a blank weight is missing", () => {
    expect(buildEquipmentChecklist(input("")).missingCore).toBe(true);
    expect(buildEquipmentChecklist(input("   ")).missingCore).toBe(true);
  });

  it("a weight that parses, with a reading, is complete", () => {
    const checklist = buildEquipmentChecklist(input("40"));
    expect(checklist.missingCore).toBe(false);
    expect(checklist.badgeLabel).toBe("可提交教练复核");
  });

  it("a weight with no reading on either foot is still missing", () => {
    expect(buildEquipmentChecklist({ ...input("40"), leftReadings: [] }).missingCore).toBe(true);
  });

  it("parseGaugeNumber still takes the first number in any text (legacy behaviour, unchanged)", () => {
    expect(parseGaugeNumber("内2mm")).toBe(2);
    expect(parseGaugeNumber("约12")).toBe(12);
  });
});
