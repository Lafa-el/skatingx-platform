import { POINTS_LEDGER_OPENING_ID, POINTS_LEDGER_REASONS, type PointsLedgerReason } from "@skatingx/schema";
import {
  getAggregateFromServer,
  getDoc,
  getDocs,
  query,
  sum,
  where,
  type Firestore,
} from "firebase/firestore";

import { pointsLedgerCollectionRef, pointsLedgerRef } from "./refs";

/**
 * One ledger event as stored. The page groups these; this reader does not.
 * `createdAt` is the stored string, kept so a day can be ordered without another query.
 */
export type PointsLedgerRow = {
  id: string;
  dateId: string;
  delta: number;
  reason: PointsLedgerReason;
  refId?: string;
  createdAt: string;
};

const DATE_ID = /^(\d{4})-(\d{2})-(\d{2})$/;
const REASONS = new Set<string>(POINTS_LEDGER_REASONS);

function isRealDateId(dateId: string): boolean {
  const match = DATE_ID.exec(dateId);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Drops a document that is not a ledger event. The aggregate still counts every stored delta. */
export function pointsLedgerRowFromDocument(id: string, data: Record<string, unknown>): PointsLedgerRow | null {
  const dateId = typeof data.dateId === "string" ? data.dateId : "";
  const delta = finiteNumber(data.delta);
  const reason = typeof data.reason === "string" ? data.reason : "";
  if (!isRealDateId(dateId) || delta === null || !REASONS.has(reason)) return null;
  const refId = typeof data.refId === "string" && data.refId.length > 0 ? data.refId : undefined;
  const createdAt = typeof data.createdAt === "string" ? data.createdAt : "";
  return { id, dateId, delta, reason: reason as PointsLedgerReason, ...(refId ? { refId } : {}), createdAt };
}

/**
 * Net of the whole ledger, including the opening line. One aggregate, no event
 * documents. An empty collection sums to 0.
 */
export async function readPointsLedgerTotal(db: Firestore, userId: string, athleteId: string): Promise<number> {
  const snapshot = await getAggregateFromServer(query(pointsLedgerCollectionRef(db, userId, athleteId)), {
    net: sum("delta"),
  });
  return finiteNumber(snapshot.data().net) ?? 0;
}

/** The opening line's delta, or 0 when that document has not been written. */
export async function readPointsLedgerOpening(db: Firestore, userId: string, athleteId: string): Promise<number> {
  const snapshot = await getDoc(pointsLedgerRef(db, userId, athleteId, POINTS_LEDGER_OPENING_ID));
  if (!snapshot.exists()) return 0;
  return finiteNumber((snapshot.data() as { delta?: unknown }).delta) ?? 0;
}

/**
 * Events whose `dateId` falls in the inclusive range. This is the displayed
 * month only; the all-time net is the aggregate above.
 */
export async function readPointsLedgerMonth(
  db: Firestore,
  userId: string,
  athleteId: string,
  startDateId: string,
  endDateId: string,
): Promise<PointsLedgerRow[]> {
  if (!isRealDateId(startDateId) || !isRealDateId(endDateId) || startDateId > endDateId) {
    throw Object.assign(new Error("points ledger month bounds"), { code: "invalid-bounds" });
  }
  const snapshot = await getDocs(
    query(
      pointsLedgerCollectionRef(db, userId, athleteId),
      where("dateId", ">=", startDateId),
      where("dateId", "<=", endDateId),
    ),
  );
  return snapshot.docs.flatMap((entry) => {
    const row = pointsLedgerRowFromDocument(entry.id, entry.data() as Record<string, unknown>);
    return row ? [row] : [];
  });
}
