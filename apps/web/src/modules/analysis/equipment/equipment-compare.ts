import { formatFixed, parseGaugeNumber, type EquipmentHistoryRecord } from "@skatingx/skating-domain";

import type { Locale } from "@/shared/i18n/translator";
import { tEquipment, type EquipmentMessageKey } from "@/shared/i18n/equipment-messages";

const dateLocale = { zh: "zh-CN", en: "en-US" } as const;

function formatDay(locale: Locale, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return tEquipment(locale, "equipment.history.unrecorded");
  }
  return new Intl.DateTimeFormat(dateLocale[locale], { dateStyle: "medium" }).format(date);
}

function signedDelta(older: number, newer: number): string {
  const delta = Number((newer - older).toFixed(2));
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function compareNumber(
  locale: Locale,
  labelKey: EquipmentMessageKey,
  olderValue: string,
  newerValue: string,
  unit: string,
): string {
  const older = parseGaugeNumber(olderValue);
  const newer = parseGaugeNumber(newerValue);
  const label = tEquipment(locale, labelKey);
  if (older === null || newer === null) {
    return tEquipment(locale, "equipment.compare.missing", { label });
  }
  return tEquipment(locale, "equipment.compare.number", {
    label,
    older: formatFixed(older, 2),
    newer: formatFixed(newer, 2),
    unit,
    delta: signedDelta(older, newer),
  });
}

function readingMap(readings: readonly { point: number; value: string }[]): Map<number, number | null> {
  return new Map(readings.map((entry) => [entry.point, parseGaugeNumber(entry.value)]));
}

function compareRocker(
  locale: Locale,
  labelKey: EquipmentMessageKey,
  olderReadings: EquipmentHistoryRecord["leftRocker"],
  newerReadings: EquipmentHistoryRecord["leftRocker"],
): string {
  const older = readingMap(olderReadings);
  const newer = readingMap(newerReadings);
  const changed: string[] = [];
  for (let point = -8; point <= 8; point += 1) {
    const before = older.get(point);
    const after = newer.get(point);
    if (before === undefined || before === null || after === undefined || after === null) continue;
    const delta = after - before;
    if (Math.abs(delta) >= 4) {
      const signedPoint = `${point > 0 ? "+" : ""}${point}`;
      const signed = `${delta > 0 ? "+" : ""}${delta}`;
      changed.push(`${signedPoint}: ${signed}`);
    }
  }
  const label = tEquipment(locale, labelKey);
  return changed.length
    ? tEquipment(locale, "equipment.compare.rockerChanged", { label, changes: changed.join(" / ") })
    : tEquipment(locale, "equipment.compare.rockerSteady", { label });
}

/** Before/after lines. The earlier record is chosen by createdAt, not by which select is A. */
export function compareEquipmentRecords(
  locale: Locale,
  recordA: EquipmentHistoryRecord,
  recordB: EquipmentHistoryRecord,
  adjustmentLabel: (record: EquipmentHistoryRecord) => string,
  feedbackLabel: (record: EquipmentHistoryRecord) => string,
): string[] {
  const older = new Date(recordA.createdAt) <= new Date(recordB.createdAt) ? recordA : recordB;
  const newer = older.id === recordA.id ? recordB : recordA;
  return [
    tEquipment(locale, "equipment.compare.range", {
      older: formatDay(locale, older.createdAt),
      newer: formatDay(locale, newer.createdAt),
    }),
    tEquipment(locale, "equipment.compare.event", {
      older: adjustmentLabel(older),
      newer: adjustmentLabel(newer),
    }),
    tEquipment(locale, "equipment.compare.feedback", {
      older: feedbackLabel(older),
      newer: feedbackLabel(newer),
    }),
    compareNumber(locale, "equipment.compare.weight", older.weight, newer.weight, "kg"),
    compareRocker(locale, "equipment.compare.leftFoot", older.leftRocker, newer.leftRocker),
    compareRocker(locale, "equipment.compare.rightFoot", older.rightRocker, newer.rightRocker),
    compareNumber(locale, "equipment.compare.leftFront", older.offsets.leftFront, newer.offsets.leftFront, "mm"),
    compareNumber(locale, "equipment.compare.leftRear", older.offsets.leftRear, newer.offsets.leftRear, "mm"),
    compareNumber(locale, "equipment.compare.rightFront", older.offsets.rightFront, newer.offsets.rightFront, "mm"),
    compareNumber(locale, "equipment.compare.rightRear", older.offsets.rightRear, newer.offsets.rightRear, "mm"),
    compareNumber(locale, "equipment.compare.bendFront", older.bend.front, newer.bend.front, " ticks"),
    compareNumber(locale, "equipment.compare.bendMiddle", older.bend.middle, newer.bend.middle, " ticks"),
    compareNumber(locale, "equipment.compare.bendRear", older.bend.rear, newer.bend.rear, " ticks"),
  ];
}
