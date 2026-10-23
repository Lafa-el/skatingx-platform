import { todayDateString, type Gamification, type TrainingState } from "@skatingx/schema";
import { calculateStreakDays, normalizeTrainingState } from "@skatingx/skating-domain";
import {
  documentId,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Firestore,
} from "firebase/firestore";

import { recordPointsChange } from "./points-ledger";
import { athleteGamificationRef, taskHistoryCollectionRef, taskHistoryRef, trainingStateRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/** One archived task, as stored. The page shows these fields and does not edit them. */
export type ArchivedTask = {
  id: string;
  text: string;
  completed: boolean;
};

/** One `taskHistory/{dateId}` document. `dateId` is the document id. */
export type ArchivedTaskDay = {
  dateId: string;
  tasks: ArchivedTask[];
};

const DATE_ID = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDateId(dateId: string): boolean {
  const match = DATE_ID.exec(dateId);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

function archivedTask(value: unknown): ArchivedTask | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id.length === 0) return null;
  if (typeof row.text !== "string") return null;
  return { id: row.id, text: row.text, completed: row.completed === true };
}

/** Readable days only. A document that is not a calendar id is skipped, not invented. */
export function archivedDayFromDocument(docId: string, data: Record<string, unknown>): ArchivedTaskDay | null {
  if (!isRealDateId(docId)) return null;
  const tasks = Array.isArray(data.tasks) ? data.tasks.flatMap((item) => {
    const task = archivedTask(item);
    return task ? [task] : [];
  }) : [];
  return { dateId: docId, tasks };
}

/**
 * The days of one month. `dateId` is the document id, so a document-id range is date order.
 * This does not read the rest of the collection.
 */
export function subscribeToTaskHistoryMonth(
  db: Firestore,
  userId: string,
  athleteId: string,
  startDateId: string,
  endDateId: string,
  onDays: (days: readonly ArchivedTaskDay[]) => void,
  onError: (error: unknown) => void,
): () => void {
  if (!isRealDateId(startDateId) || !isRealDateId(endDateId) || startDateId > endDateId) {
    onError(Object.assign(new Error("task history month bounds"), { code: "invalid-bounds" }));
    return () => {};
  }
  const month = query(
    taskHistoryCollectionRef(db, userId, athleteId),
    where(documentId(), ">=", startDateId),
    where(documentId(), "<=", endDateId),
  );
  return onSnapshot(
    month,
    (snapshot) => {
      const days = snapshot.docs
        .flatMap((entry) => {
          const day = archivedDayFromDocument(entry.id, entry.data());
          return day ? [day] : [];
        })
        .sort((a, b) => a.dateId.localeCompare(b.dateId));
      onDays(days);
    },
    onError,
  );
}

/**
 * Deletes that day's archive and takes back the points it earned at the current
 * task and full-attendance rates. The streak is recomputed from the remaining
 * full-attendance days. One history-delete event records the points actually
 * removed (the balance never goes below zero). A missing document does not
 * change the balance or the streak.
 */
export async function deleteTaskHistoryDay(
  db: Firestore,
  userId: string,
  athleteId: string,
  dateId: string,
): Promise<void> {
  if (!isRealDateId(dateId)) return;
  const historyRef = taskHistoryRef(db, userId, athleteId, dateId);
  const stateRef = trainingStateRef(db, userId, athleteId);
  const gamificationRef = athleteGamificationRef(db, userId, athleteId);
  const today = todayDateString();

  await runTransaction(db, async (tx) => {
    const historySnap = await tx.get(historyRef);
    const stateSnap = await tx.get(stateRef);
    const gamificationSnap = await tx.get(gamificationRef);
    const gamification = gamificationFromHistory(gamificationSnap.data() as Gamification | undefined);
    if (!historySnap.exists()) {
      await recordPointsChange(tx, db, userId, athleteId, gamification.points, [], today);
      return;
    }
    const state = normalizeTrainingState(stateSnap.data() as TrainingState | undefined);
    const day = archivedDayFromDocument(dateId, historySnap.data() ?? {});
    const completedCount = (day?.tasks ?? []).filter((task) => task.completed).length;
    const fullAttendance = gamification.completedDays.includes(dateId);
    let reclaim = completedCount * state.pointsPerTask;
    if (fullAttendance) reclaim += state.dailyBonusPoints;
    const points = await recordPointsChange(
      tx,
      db,
      userId,
      athleteId,
      gamification.points,
      reclaim === 0
        ? []
        : [{ dateId, delta: -reclaim, reason: "history-delete", refId: dateId }],
      today,
    );
    const completedDays = fullAttendance
      ? gamification.completedDays.filter((dayId) => dayId !== dateId)
      : gamification.completedDays;
    const streakDays = calculateStreakDays(completedDays, today);

    tx.delete(historyRef);
    if (gamificationSnap.exists()) {
      tx.update(
        gamificationRef,
        toFirestoreData({
          points,
          completedDays,
          streakDays,
          updatedAt: serverTimestamp(),
        }),
      );
    }
  });
}

function gamificationFromHistory(data: Gamification | undefined): Pick<Gamification, "points" | "completedDays"> {
  return {
    points: data?.points ?? 0,
    completedDays: data?.completedDays ?? [],
  };
}
