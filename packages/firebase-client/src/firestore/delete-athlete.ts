import { pathToSegments, paths } from "@skatingx/schema";
import {
  collection,
  deleteDoc,
  deleteField,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type Firestore,
  type Query,
} from "firebase/firestore";

import { listAthleteProfiles } from "./athlete-roster";
import {
  athleteGamificationRef,
  athleteProfileRef,
  raceDayEventsCollectionRef,
  raceDayResultsCollectionRef,
  raceDayRosterCollectionRef,
  raceDayVideosCollectionRef,
  settingsRef,
  trainingRewardsCatalogRef,
  trainingStateRef,
} from "./refs";

/** Stay under Firestore's 500-write batch cap. */
const BATCH_LIMIT = 450;

/**
 * Collections `deleteAthlete` clears. These are the same path helpers the live
 * collection refs pass to `collection()`. Race-day collections are not here:
 * they also need an event id, and the event refs stay the source for those.
 */
export function athleteDeleteCollectionPaths(userId: string, athleteId: string) {
  return {
    pointsLedger: paths.pointsLedgerCollection(userId, athleteId),
    taskHistory: paths.taskHistoryCollection(userId, athleteId),
    trainingRecords: paths.trainingRecordsCollection(userId, athleteId),
    redemptions: paths.trainingRedemptionsCollection(userId, athleteId),
    equipmentHistory: paths.equipmentHistoryCollection(userId, athleteId),
    analyses: paths.analysesCollection(userId),
  };
}

function collectionFromPath(db: Firestore, path: string): CollectionReference {
  const segments = pathToSegments(path);
  return collection(db, ...(segments as [string, ...string[]]));
}

async function deleteInBatches(db: Firestore, source: Query): Promise<void> {
  for (;;) {
    const snap = await getDocs(query(source, limit(BATCH_LIMIT)));
    if (snap.empty) {
      return;
    }
    const batch = writeBatch(db);
    for (const item of snap.docs) {
      batch.delete(item.ref);
    }
    await batch.commit();
    if (snap.size < BATCH_LIMIT) {
      return;
    }
  }
}

async function deleteCollection(db: Firestore, col: CollectionReference): Promise<void> {
  await deleteInBatches(db, query(col));
}

/**
 * Delete one athlete and the data that belongs to them.
 * The profile document goes last, so a failed run can still find the person and retry.
 * Switching or clearing the active athlete happens only after the deletes succeed.
 * A retry that finds nothing left just finishes the switch. The journal, the account,
 * the PIN, and race-day summaries are left in place.
 */
export async function deleteAthlete(
  db: Firestore,
  userId: string,
  athleteId: string,
): Promise<void> {
  const collections = athleteDeleteCollectionPaths(userId, athleteId);

  await deleteDoc(athleteGamificationRef(db, userId, athleteId));
  await deleteDoc(trainingStateRef(db, userId, athleteId));
  await deleteDoc(trainingRewardsCatalogRef(db, userId, athleteId));

  await deleteCollection(db, collectionFromPath(db, collections.pointsLedger));
  await deleteCollection(db, collectionFromPath(db, collections.taskHistory));
  await deleteCollection(db, collectionFromPath(db, collections.trainingRecords));
  await deleteCollection(db, collectionFromPath(db, collections.redemptions));
  await deleteCollection(db, collectionFromPath(db, collections.equipmentHistory));
  // paths.trainingRace, paths.equipmentRecord, and paths.analysisSession are unused.
  // A collection path taken from them has an even segment count, which collection()
  // rejects, and nothing was ever written there, so those collections are not deleted.

  await deleteInBatches(
    db,
    query(collectionFromPath(db, collections.analyses), where("athleteId", "==", athleteId)),
  );

  const events = await getDocs(raceDayEventsCollectionRef(db, userId));
  for (const event of events.docs) {
    await deleteRaceDayAthlete(db, userId, event.id, athleteId);
  }

  await deleteDoc(athleteProfileRef(db, userId, athleteId));
  await settleActiveAthlete(db, userId, athleteId);
}

async function deleteRaceDayAthlete(
  db: Firestore,
  userId: string,
  eventId: string,
  athleteId: string,
): Promise<void> {
  const roster = raceDayRosterCollectionRef(db, userId, eventId);
  for (;;) {
    const snap = await getDocs(
      query(roster, where("athleteRefId", "==", athleteId), limit(BATCH_LIMIT)),
    );
    if (snap.empty) {
      return;
    }
    for (const row of snap.docs) {
      await deleteInBatches(
        db,
        query(
          raceDayResultsCollectionRef(db, userId, eventId),
          where("rosterId", "==", row.id),
        ),
      );
      await deleteInBatches(
        db,
        query(
          raceDayVideosCollectionRef(db, userId, eventId),
          where("rosterId", "==", row.id),
        ),
      );
    }
    const batch = writeBatch(db);
    for (const row of snap.docs) {
      batch.delete(row.ref);
    }
    await batch.commit();
    if (snap.size < BATCH_LIMIT) {
      return;
    }
  }
}

async function settleActiveAthlete(
  db: Firestore,
  userId: string,
  athleteId: string,
): Promise<void> {
  const settingsSnap = await getDoc(settingsRef(db, userId));
  const active = settingsSnap.get("activeAthleteId");
  if (active !== athleteId) {
    return;
  }

  const remaining = (await listAthleteProfiles(db, userId)).filter(
    (entry) => entry.athleteId !== athleteId,
  );
  const ref = settingsRef(db, userId);
  if (remaining.length === 0) {
    // updateUserSettings runs the patch through toFirestoreData, which turns a
    // FieldValue into an empty object. Clear the field with updateDoc directly.
    await updateDoc(ref, {
      activeAthleteId: deleteField(),
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await updateDoc(ref, {
    activeAthleteId: remaining[0]?.athleteId,
    updatedAt: serverTimestamp(),
  });
}
