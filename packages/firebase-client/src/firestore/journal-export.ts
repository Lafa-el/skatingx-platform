import { getDocs, type Firestore } from "firebase/firestore";

import { bodyStatusFromDocument, type BodyStatusRecord } from "./journal-body-status";
import { coachNoteFromDocument, type CoachNoteRecord } from "./journal-coach-notes";
import { weeklyReviewFromDocument, type WeeklyReviewRecord } from "./journal-weekly-reviews";
import { journalDayFromDocument, journalSessionFromDocument, type JournalDayRecord, type JournalSessionRecord } from "./journal";
import {
  journalBodyStatusCollectionRef,
  journalCoachNotesCollectionRef,
  journalDaysCollectionRef,
  journalSessionsCollectionRef,
  journalWeeklyReviewsCollectionRef,
  videoEntriesCollectionRef,
} from "./refs";
import { videoEntryFromDocument, type VideoEntryRecord } from "./videos";

export type JournalExportCollection =
  | "days"
  | "sessions"
  | "coachNotes"
  | "bodyStatus"
  | "weeklyReviews"
  | "videos";

/**
 * One read of the journal export. `dropped` counts documents that could not be parsed.
 * A collection that fails to read is empty and named in `failedCollections`; the other collections still return.
 */
export type JournalExportRead = {
  days: JournalDayRecord[];
  sessions: JournalSessionRecord[];
  coachNotes: CoachNoteRecord[];
  bodyStatus: BodyStatusRecord[];
  weeklyReviews: WeeklyReviewRecord[];
  videos: VideoEntryRecord[];
  failedCollections: JournalExportCollection[];
  dropped: number;
};

type DocSnap = { id: string; data: () => unknown };

async function readCollection<T>(
  load: () => Promise<{ docs: readonly DocSnap[] }>,
  parse: (id: string, data: unknown) => T | null,
): Promise<{ rows: T[]; dropped: number; failed: boolean }> {
  try {
    const snapshot = await load();
    const rows: T[] = [];
    let dropped = 0;
    for (const entry of snapshot.docs) {
      const row = parse(entry.id, entry.data());
      if (row) rows.push(row);
      else dropped += 1;
    }
    return { rows, dropped, failed: false };
  } catch {
    return { rows: [], dropped: 0, failed: true };
  }
}

/** Six collection reads. Each one stands alone, so one failure does not throw or skip the rest. */
export async function readJournalExport(db: Firestore, userId: string): Promise<JournalExportRead> {
  const [days, sessions, coachNotes, bodyStatus, weeklyReviews, videos] = await Promise.all([
    readCollection(() => getDocs(journalDaysCollectionRef(db, userId)), journalDayFromDocument),
    readCollection(() => getDocs(journalSessionsCollectionRef(db, userId)), journalSessionFromDocument),
    readCollection(() => getDocs(journalCoachNotesCollectionRef(db, userId)), coachNoteFromDocument),
    readCollection(() => getDocs(journalBodyStatusCollectionRef(db, userId)), bodyStatusFromDocument),
    readCollection(() => getDocs(journalWeeklyReviewsCollectionRef(db, userId)), weeklyReviewFromDocument),
    readCollection(() => getDocs(videoEntriesCollectionRef(db, userId)), videoEntryFromDocument),
  ]);
  const failedCollections: JournalExportCollection[] = [];
  if (days.failed) failedCollections.push("days");
  if (sessions.failed) failedCollections.push("sessions");
  if (coachNotes.failed) failedCollections.push("coachNotes");
  if (bodyStatus.failed) failedCollections.push("bodyStatus");
  if (weeklyReviews.failed) failedCollections.push("weeklyReviews");
  if (videos.failed) failedCollections.push("videos");
  return {
    days: days.rows,
    sessions: sessions.rows,
    coachNotes: coachNotes.rows,
    bodyStatus: bodyStatus.rows,
    weeklyReviews: weeklyReviews.rows,
    videos: videos.rows,
    failedCollections,
    dropped: days.dropped + sessions.dropped + coachNotes.dropped + bodyStatus.dropped + weeklyReviews.dropped + videos.dropped,
  };
}
