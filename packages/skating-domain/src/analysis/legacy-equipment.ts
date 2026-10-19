/**
 * Behavior port of the equipment checklist rules in blaze-skate-analysis `index.html`.
 * Gauge numbers are synthetic inputs. No saved athlete record is read.
 */

export interface GaugeReading {
  readonly point: number;
  readonly value: string;
}

export interface EquipmentOffsets {
  readonly leftFront: string;
  readonly leftRear: string;
  readonly rightFront: string;
  readonly rightRear: string;
}

export interface EquipmentBend {
  readonly front: string;
  readonly middle: string;
  readonly rear: string;
}

export function parseGaugeNumber(value: string): number | null {
  const match = String(value || "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function valueAt(readings: readonly GaugeReading[], point: number): number | null {
  const reading = readings.find((entry) => entry.point === point);
  return reading ? parseGaugeNumber(reading.value) : null;
}

export function analyzeRockerSide(label: string, readings: readonly GaugeReading[]): string[] {
  const hints: string[] = [];
  const center = valueAt(readings, 0);
  if (center === null) {
    hints.push(`${label}缺少中心点 0 读数，无法判断曲线是否从中心平顺展开。`);
    return hints;
  }

  (
    [
      { name: "刀头", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      { name: "刀尾", points: [-1, -2, -3, -4, -5, -6, -7, -8] },
    ] as const
  ).forEach((section) => {
    let previous = center;
    section.points.forEach((point) => {
      const current = valueAt(readings, point);
      if (current === null) return;
      const signed = `${point > 0 ? "+" : ""}${point}`;
      if (current + 3 < previous) {
        hints.push(`${label}${section.name} ${signed} 读数低于前一测点，建议复测是否量具角度或接触点偏了。`);
      }
      if (Math.abs(current - previous) > 18) {
        hints.push(`${label}${section.name} ${signed} 与前一测点跳变较大，建议复测该点并检查磨弧连续性。`);
      }
      previous = current;
    });
  });
  return hints;
}

export function analyzeLeftRightRocker(
  leftReadings: readonly GaugeReading[],
  rightReadings: readonly GaugeReading[],
): string[] {
  const hints: string[] = [];
  for (let point = -8; point <= 8; point += 1) {
    const left = valueAt(leftReadings, point);
    const right = valueAt(rightReadings, point);
    if (left === null || right === null) continue;
    if (Math.abs(left - right) >= 8) {
      hints.push(
        `左右脚 ${point > 0 ? "+" : ""}${point} 点相差 ${Math.abs(left - right)} ticks，建议复核左右脚弧度一致性。`,
      );
    }
  }
  return hints;
}

export function analyzeOffsetValues(offsets: EquipmentOffsets): string[] {
  const hints: string[] = [];
  const leftFront = parseGaugeNumber(offsets.leftFront);
  const leftRear = parseGaugeNumber(offsets.leftRear);
  const rightFront = parseGaugeNumber(offsets.rightFront);
  const rightRear = parseGaugeNumber(offsets.rightRear);
  if (leftFront !== null && leftRear !== null && Math.abs(leftFront - leftRear) >= 2) {
    hints.push(`左脚前后 Offset 相差 ${Math.abs(leftFront - leftRear)}mm，建议检查刀架是否存在前后扭斜。`);
  }
  if (rightFront !== null && rightRear !== null && Math.abs(rightFront - rightRear) >= 2) {
    hints.push(`右脚前后 Offset 相差 ${Math.abs(rightFront - rightRear)}mm，建议检查刀架是否存在前后扭斜。`);
  }
  if (leftFront !== null && rightFront !== null && Math.abs(leftFront - rightFront) >= 2) {
    hints.push(`左右脚前点 Offset 相差 ${Math.abs(leftFront - rightFront)}mm，建议确认是否为刻意设定。`);
  }
  if (leftRear !== null && rightRear !== null && Math.abs(leftRear - rightRear) >= 2) {
    hints.push(`左右脚后点 Offset 相差 ${Math.abs(leftRear - rightRear)}mm，建议确认是否为刻意设定。`);
  }
  return hints;
}

export function analyzeBendValues(front: string, middle: string, rear: string): string[] {
  const values = [parseGaugeNumber(front), parseGaugeNumber(middle), parseGaugeNumber(rear)].filter(
    (value): value is number => value !== null,
  );
  if (values.length < 2) return [];
  const spread = Math.max(...values) - Math.min(...values);
  if (spread >= 10) {
    return [`Bend 三段最大差为 ${spread} ticks，建议复核压弯是否过于集中在某一段。`];
  }
  return [];
}

const NO_RULE_HINT = "当前已填数据未触发明显异常规则。建议保存本次记录，结合上冰反馈做调整前后对比。";

export function buildEquipmentRuleHints(input: {
  readonly leftReadings: readonly GaugeReading[];
  readonly rightReadings: readonly GaugeReading[];
  readonly offsets: EquipmentOffsets;
  readonly bend: EquipmentBend;
}): readonly string[] {
  const hints = [
    ...analyzeRockerSide("左脚", input.leftReadings),
    ...analyzeRockerSide("右脚", input.rightReadings),
    ...analyzeLeftRightRocker(input.leftReadings, input.rightReadings),
    ...analyzeOffsetValues(input.offsets),
    ...analyzeBendValues(input.bend.front, input.bend.middle, input.bend.rear),
  ];
  return hints.length ? hints : [NO_RULE_HINT];
}

export function buildEquipmentChecklist(input: {
  readonly weightRaw: string;
  readonly leftReadings: readonly GaugeReading[];
  readonly rightReadings: readonly GaugeReading[];
  readonly offsets: EquipmentOffsets;
  readonly bend: EquipmentBend;
}): {
  readonly missingCore: boolean;
  readonly badgeLabel: "记录不完整" | "可提交教练复核";
  readonly actionValue: "补全曲线/体重" | "左右脚曲线待复核";
  readonly hints: readonly string[];
} {
  const missingCore = !input.weightRaw || (!input.leftReadings.length && !input.rightReadings.length);
  return {
    missingCore,
    badgeLabel: missingCore ? "记录不完整" : "可提交教练复核",
    actionValue: missingCore ? "补全曲线/体重" : "左右脚曲线待复核",
    hints: buildEquipmentRuleHints(input),
  };
}
