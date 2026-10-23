import {
  deleteDoc,
  documentId,
  onSnapshot,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

import { taskHistoryCollectionRef, taskHistoryRef } from "./refs";

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
 * Removes that day's archive document. Points and the streak live on the gamification
 * document and are not read or written here.
 */
export async function deleteTaskHistoryDay(
  db: Firestore,
  userId: string,
  athleteId: string,
  dateId: string,
): Promise<void> {
  await deleteDoc(taskHistoryRef(db, userId, athleteId, dateId));
}
