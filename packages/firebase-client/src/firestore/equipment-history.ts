import type { EquipmentHistoryRecord } from "@skatingx/skating-domain";
import {
  deleteDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
} from "firebase/firestore";

import { equipmentHistoryCollectionRef, equipmentHistoryRecordRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/**
 * One equipment-history listener. The legacy profile and check-in listeners are not opened here.
 * The caller must use the returned function on unmount.
 */
export function subscribeToEquipmentHistory(
  db: Firestore,
  userId: string,
  athleteId: string,
  onRecords: (records: readonly EquipmentHistoryRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  const history = query(
    equipmentHistoryCollectionRef(db, userId, athleteId),
    orderBy("createdAt", "desc"),
    limit(30),
  );
  return onSnapshot(
    history,
    (snapshot) => {
      const records = snapshot.docs.flatMap((entry) => {
        const data = entry.data();
        if (typeof data.createdAt !== "string" || typeof data.id !== "string") {
          return [];
        }
        return [data as EquipmentHistoryRecord];
      });
      onRecords(records);
    },
    onError,
  );
}

export async function saveEquipmentHistoryRecord(
  db: Firestore,
  record: EquipmentHistoryRecord,
): Promise<void> {
  await setDoc(
    equipmentHistoryRecordRef(db, record.ownerUserId, record.athleteId, record.id),
    toFirestoreData({ ...record }),
  );
}

export async function deleteEquipmentHistoryRecord(
  db: Firestore,
  userId: string,
  athleteId: string,
  recordId: string,
): Promise<void> {
  await deleteDoc(equipmentHistoryRecordRef(db, userId, athleteId, recordId));
}
