import type { PointsLedgerReason } from "@skatingx/schema";

export type PointsLedgerDraft = {
  dateId: string;
  delta: number;
  reason: PointsLedgerReason;
  refId?: string;
};

/**
 * Apply drafts in order and stop at zero. A draft that would cross below zero is
 * recorded only for the points that were actually removed, so the stored balance
 * stays equal to the sum of recorded deltas.
 */
export function clampPointsDeltas(
  balance: number,
  drafts: readonly PointsLedgerDraft[],
): { points: number; applied: PointsLedgerDraft[] } {
  let points = Number.isFinite(balance) ? balance : 0;
  const applied: PointsLedgerDraft[] = [];
  for (const draft of drafts) {
    if (!Number.isFinite(draft.delta) || draft.delta === 0) continue;
    const next = points + draft.delta;
    const delta = next < 0 ? -points : draft.delta;
    if (delta === 0) continue;
    points += delta;
    applied.push({ ...draft, delta });
  }
  return { points, applied };
}
