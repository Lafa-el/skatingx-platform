import type { BiomechAnalysisRecord } from "@skatingx/skating-domain";
import { setDoc, type Firestore } from "firebase/firestore";

import { analysisRecordRef } from "./refs";
import { toFirestoreData } from "./sanitize";

/**
 * One write, then done. Video bytes are not part of the record. The legacy
 * profile and check-in listeners are not started here.
 */
export async function saveBiomechAnalysisRecord(
  db: Firestore,
  record: BiomechAnalysisRecord,
): Promise<void> {
  await setDoc(
    analysisRecordRef(db, record.ownerUserId, record.id),
    toFirestoreData({ ...record }),
  );
}
