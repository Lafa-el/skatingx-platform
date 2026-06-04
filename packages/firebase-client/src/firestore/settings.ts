import type { UserSettings } from "@skatingx/schema";
import { serverTimestamp, updateDoc, type Firestore } from "firebase/firestore";

import { settingsRef } from "./refs";
import { toFirestoreData } from "./sanitize";

export async function updateUserSettings(
  db: Firestore,
  userId: string,
  patch: Partial<
    Pick<
      UserSettings,
      "language" | "theme" | "isPro" | "parentPinEnabled" | "activeAthleteId"
    >
  >,
): Promise<void> {
  await updateDoc(
    settingsRef(db, userId),
    toFirestoreData({
      ...patch,
      updatedAt: serverTimestamp(),
    }),
  );
}
