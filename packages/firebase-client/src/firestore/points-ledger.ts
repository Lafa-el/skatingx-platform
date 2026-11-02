import { POINTS_LEDGER_OPENING_ID, type PointsLedgerEvent } from "@skatingx/schema";
import { clampPointsDeltas, type PointsLedgerDraft } from "@skatingx/skating-domain";
import {
  getDoc,
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
 * True only when the ledger has no documents. The opening document lives in
 * that collection, so both reads stay: a missing opening line is not an empty
 * ledger once any other event is there.
 *
 * The probe stays outside the transaction. This SDK can only `tx.get` a
 * document inside a transaction; a collection query cannot join it. Callers
 * compute the flag before `runTransaction` and pass it in. The guard still
 * holds inside the transaction: an opening line is written only when the flag
 * is set, the balance is above zero, and `tx.get` still finds no opening
 * document. A line created between the probe and the commit is not written a
 * second time. Reading only the opening document would invent that line when
 * other events already exist, and the same points would be counted twice.
 */
export async function probeLedgerEmpty(
  db: Firestore,
  userId: string,
  athleteId: string,
): Promise<boolean> {
  const [openingSnap, anyEvent] = await Promise.all([
    getDoc(pointsLedgerRef(db, userId, athleteId, POINTS_LEDGER_OPENING_ID)),
    getDocs(query(pointsLedgerCollectionRef(db, userId, athleteId), limit(1))),
  ]);
  return !openingSnap.exists() && anyEvent.empty;
}

/**
 * Appends the drafts, and an opening line only when `ledgerEmpty` is set, the
 * balance is above zero, and the opening document is still absent. That
 * document read is the only ledger read inside the transaction. The returned
 * balance is `pointsBefore` plus the deltas actually recorded.
 */
export async function recordPointsChange(
  tx: Transaction,
  db: Firestore,
  userId: string,
  athleteId: string,
  pointsBefore: number,
  drafts: readonly PointsLedgerDraft[],
  today: string,
  ledgerEmpty: boolean,
): Promise<number> {
  const openingRef = pointsLedgerRef(db, userId, athleteId, POINTS_LEDGER_OPENING_ID);
  const openingSnap = await tx.get(openingRef);
  const balance = Number.isFinite(pointsBefore) ? pointsBefore : 0;
  const { points, applied } = clampPointsDeltas(balance, drafts);
  const createdAt = new Date().toISOString();

  if (ledgerEmpty && balance > 0 && !openingSnap.exists()) {
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
  const ledgerEmpty = await probeLedgerEmpty(db, userId, athleteId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gamificationRef);
    const points = snap.exists() ? Number((snap.data() as { points?: unknown }).points ?? 0) : 0;
    await recordPointsChange(tx, db, userId, athleteId, points, [], today, ledgerEmpty);
  });
}
