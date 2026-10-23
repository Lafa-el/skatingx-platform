import { POINTS_LEDGER_OPENING_ID, type PointsLedgerEvent } from "@skatingx/schema";
import { clampPointsDeltas, type PointsLedgerDraft } from "@skatingx/skating-domain";
import {
  getDocs,
  limit,
  query,
  runTransaction,
  type Firestore,
  type Transaction,
} from "firebase/firestore";

import { athleteGamificationRef, pointsLedgerCollectionRef, pointsLedgerRef } from "./refs";
import { toFirestoreData } from "./sanitize";

function eventId(): string {
  return crypto.randomUUID();
}

function eventBody(draft: PointsLedgerDraft, createdAt: string): PointsLedgerEvent {
  return {
    dateId: draft.dateId,
    delta: draft.delta,
    reason: draft.reason,
    ...(draft.refId ? { refId: draft.refId } : {}),
    createdAt,
  };
}

/**
 * Reads the opening document, then appends it (when the ledger is empty and
 * the balance is above zero) and the drafts. Reads finish before any write.
 * The returned balance is `pointsBefore` plus the deltas actually recorded.
 *
 * This SDK's transaction can only read documents, so the empty-ledger probe is
 * a limit(1) read. The opening document id is fixed: a retry finds it and does
 * not write a second line. An existing event without that document is left
 * alone, because a new opening line would count the same points twice.
 */
export async function recordPointsChange(
  tx: Transaction,
  db: Firestore,
  userId: string,
  athleteId: string,
  pointsBefore: number,
  drafts: readonly PointsLedgerDraft[],
  today: string,
): Promise<number> {
  const openingRef = pointsLedgerRef(db, userId, athleteId, POINTS_LEDGER_OPENING_ID);
  const openingSnap = await tx.get(openingRef);
  const balance = Number.isFinite(pointsBefore) ? pointsBefore : 0;
  const { points, applied } = clampPointsDeltas(balance, drafts);
  const createdAt = new Date().toISOString();
  const ledgerEmpty =
    !openingSnap.exists() &&
    balance > 0 &&
    (
      await getDocs(query(pointsLedgerCollectionRef(db, userId, athleteId), limit(1)))
    ).empty;

  if (ledgerEmpty) {
    tx.set(
      openingRef,
      toFirestoreData(
        eventBody(
          { dateId: today, delta: balance, reason: "opening-balance" },
          createdAt,
        ),
      ),
    );
  }
  for (const draft of applied) {
    tx.set(
      pointsLedgerRef(db, userId, athleteId, eventId()),
      toFirestoreData(eventBody(draft, createdAt)),
    );
  }
  return points;
}

/**
 * The read path for the ledger. If nothing has been recorded and the balance
 * is above zero, one opening event explains that stock. Repeating it does not
 * add another event.
 */
export async function ensurePointsOpeningBalance(
  db: Firestore,
  userId: string,
  athleteId: string,
  today: string,
): Promise<void> {
  const gamificationRef = athleteGamificationRef(db, userId, athleteId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gamificationRef);
    const points = snap.exists() ? Number((snap.data() as { points?: unknown }).points ?? 0) : 0;
    await recordPointsChange(tx, db, userId, athleteId, points, [], today);
  });
}
