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
 * Keeps the findings that downstream code can read: objects whose `code` is a string. The item
 * itself is kept as stored, because the equipment page shows the whole record and each item
 * carries an `analysisId`. Anything else is dropped without a trace, as for saved analyses.
 */
function readableFindings(value: unknown): EquipmentHistoryRecord["findings"] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is { code: string; analysisId: string } =>
      item !== null && typeof item === "object" && typeof (item as { code?: unknown }).code === "string",
  );
}

/**
 * One stored equipment document as a record, or `null` for one that has no usable `id` and
 * `createdAt`. Every reader of the listener (the hub and the plan page) gets findings that cannot
 * throw: a malformed `findings` would otherwise make `hasEquipmentSymptom` throw and fail the page.
 */
export function equipmentHistoryFromDocument(data: unknown): EquipmentHistoryRecord | null {
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  if (typeof fields.id !== "string" || typeof fields.createdAt !== "string") return null;
  return { ...fields, findings: readableFindings(fields.findings) } as unknown as EquipmentHistoryRecord;
}

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
        const record = equipmentHistoryFromDocument(entry.data());
        return record ? [record] : [];
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
