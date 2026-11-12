/**
 * Reviewed links from a weekly-plan routine item to the academy drill it names.
 * Built from ROUTINE_MATCHES: `{stage}-wp-{n}#{i}` becomes `{stage}-w{n}-t{i}`.
 * A routine id that is not in this table stays a plain label. Nothing is matched at import time.
 */
export const ROUTINE_MODULE_LINKS: Readonly<Record<string, string>> = {
  "age4_7-w0-t0": "age4_7-m0-i0",
  "age4_7-w0-t1": "age4_7-m1-i0",
  "age4_7-w0-t2": "age4_7-m2-i0",
  "age4_7-w0-t3": "age4_7-m3-i0",
  "age4_7-w0-t4": "age4_7-m1-i5",
  "age4_7-w1-t0": "age4_7-m0-i1",
  "age4_7-w1-t1": "age4_7-m1-i3",
  "age4_7-w1-t2": "age4_7-m2-i1",
  "age4_7-w1-t3": "age4_7-m3-i2",
  "age4_7-w1-t4": "age4_7-m4-i1",
  "age4_7-w2-t0": "age4_7-m0-i2",
  "age4_7-w2-t1": "age4_7-m1-i4",
  "age4_7-w2-t2": "age4_7-m2-i3",
  "age4_7-w2-t3": "age4_7-m0-i3",
  "age4_7-w2-t4": "age4_7-m4-i0",
  "age8_10-w0-t0": "age8_10-m0-i1",
  "age8_10-w0-t1": "age8_10-m0-i3",
  "age8_10-w0-t2": "age8_10-m0-i5",
  "age8_10-w0-t3": "age8_10-m2-i0",
  "age8_10-w1-t0": "age8_10-m1-i0",
  "age8_10-w1-t1": "age8_10-m1-i2",
  "age8_10-w1-t2": "age8_10-m1-i4",
  "age8_10-w2-t0": "age8_10-m1-i1",
  "age8_10-w2-t1": "age8_10-m1-i3",
  "age8_10-w2-t2": "age8_10-m3-i0",
  "age8_10-w2-t3": "age8_10-m3-i1",
  "age8_10-w2-t4": "age8_10-m3-i2",
  "age8_10-w3-t0": "age8_10-m4-i0",
  "age8_10-w3-t1": "age8_10-m2-i2",
  "age8_10-w3-t2": "age8_10-m2-i1",
  "age8_10-w3-t3": "age8_10-m0-i0",
  "age8_10-w4-t0": "age8_10-m4-i1",
  "age8_10-w4-t1": "age8_10-m4-i2",
  "age8_10-w4-t2": "age8_10-m0-i2",
  "age8_10-w4-t3": "age8_10-m0-i4",
  "age11_13-w0-t0": "age11_13-m0-i0",
  "age11_13-w0-t1": "age11_13-m3-i0",
  "age11_13-w0-t2": "age11_13-m0-i1",
  "age11_13-w0-t3": "age11_13-m0-i2",
  "age11_13-w0-t4": "age11_13-m0-i3",
  "age11_13-w1-t0": "age11_13-m1-i3",
  "age11_13-w1-t1": "age11_13-m1-i1",
  "age11_13-w1-t2": "age11_13-m1-i0",
  "age11_13-w1-t3": "age11_13-m1-i2",
  "age11_13-w1-t4": "age11_13-m4-i0",
  "age11_13-w1-t5": "age11_13-m4-i4",
  "age11_13-w1-t6": "age11_13-m4-i7",
  "age11_13-w2-t0": "shared-m0-i3",
  "age11_13-w2-t1": "shared-m0-i4",
  "age11_13-w2-t2": "shared-m0-i2",
  "age11_13-w2-t3": "shared-m0-i0",
  "age11_13-w3-t0": "age11_13-m2-i0",
  "age11_13-w3-t1": "age11_13-m2-i1",
  "age11_13-w3-t2": "age11_13-m3-i3",
  "age11_13-w3-t3": "age11_13-m3-i1",
  "age11_13-w3-t4": "age11_13-m4-i5",
  "age11_13-w3-t5": "age11_13-m4-i3",
  "age11_13-w4-t0": "age11_13-m3-i2",
  "age11_13-w4-t1": "age11_13-m0-i4",
  "age11_13-w4-t2": "age11_13-m0-i5",
  "age11_13-w4-t3": "age11_13-m0-i6",
  "age11_13-w5-t0": "age11_13-m2-i2",
  "age11_13-w5-t1": "age11_13-m1-i3",
  "age11_13-w5-t2": "age11_13-m4-i1",
  "age11_13-w5-t3": "age11_13-m4-i2",
  "age11_13-w5-t4": "age11_13-m4-i6",
  "age11_13-w6-t0": "shared-m0-i1",
  "age11_13-w6-t1": "shared-m0-i2",
  "age11_13-w6-t2": "shared-m0-i5",
  "age14_16-w0-t0": "age14_16-m0-i0",
  "age14_16-w0-t1": "age14_16-m0-i3",
  "age14_16-w0-t2": "age14_16-m0-i2",
  "age14_16-w0-t3": "age14_16-m0-i4",
  "age14_16-w0-t4": "age14_16-m0-i1",
  "age14_16-w1-t0": "age14_16-m1-i0",
  "age14_16-w1-t1": "age14_16-m1-i1",
  "age14_16-w1-t2": "age14_16-m1-i2",
  "age14_16-w2-t0": "shared-m0-i3",
  "age14_16-w2-t1": "shared-m0-i4",
  "age14_16-w2-t2": "shared-m0-i2",
  "age14_16-w2-t3": "shared-m0-i0",
  "age14_16-w3-t0": "age14_16-m2-i0",
  "age14_16-w3-t1": "age14_16-m2-i1",
  "age14_16-w3-t2": "age14_16-m2-i2",
  "age14_16-w3-t3": "age14_16-m2-i3",
  "age14_16-w4-t0": "age14_16-m2-i4",
  "age14_16-w4-t1": "age14_16-m2-i5",
  "age14_16-w4-t2": "age14_16-m0-i4",
  "age14_16-w4-t3": "age14_16-m1-i1",
  "age14_16-w5-t0": "shared-m1-i0",
  "age14_16-w5-t1": "age14_16-m2-i6",
  "age14_16-w5-t2": "age14_16-m1-i2",
  "age14_16-w5-t3": "age14_16-m1-i0",
  "age14_16-w6-t0": "shared-m0-i1",
  "age14_16-w6-t1": "shared-m0-i2",
  "age14_16-w6-t2": "shared-m0-i5",
};

export function resolveRoutineModuleLink(routineItemId: string): string | undefined {
  return ROUTINE_MODULE_LINKS[routineItemId];
}

/**
 * `{stage}-wp-{n}` plus a task index is the routine item id `{stage}-w{n}-t{index}`.
 * Anything that is not that day-plan id returns null, so the caller keeps a plain label.
 */
export function routineItemIdForDayPlanTask(
  stageId: string,
  dayPlanId: string,
  taskIndex: number,
): string | null {
  const prefix = `${stageId}-wp-`;
  if (!dayPlanId.startsWith(prefix)) return null;
  const index = dayPlanId.slice(prefix.length);
  if (!/^\d+$/.test(index)) return null;
  return `${stageId}-w${index}-t${taskIndex}`;
}
