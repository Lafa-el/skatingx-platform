import type { PaceAnalysisRecord } from "@skatingx/skating-domain";
import { setDoc, type Firestore } from "firebase/firestore";

import { analysisRecordRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/**
 * One write, then done. This slice does not open a listener, so there is nothing
 * to unsubscribe. The legacy profile, check-in, and equipment listeners are not
 * started here.
 */
export async function savePaceAnalysisRecord(
  db: Firestore,
  record: PaceAnalysisRecord,
): Promise<void> {
  await setDoc(
    analysisRecordRef(db, record.ownerUserId, record.id),
    toFirestoreData({ ...record }),
  );
}
