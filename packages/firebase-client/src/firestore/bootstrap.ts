import {
  createDefaultAthleteProfile,
  createDefaultGamification,
  createDefaultTrainingState,
  createDefaultUserSettings,
  DEFAULT_ATHLETE_ID,
} from "@skatingx/schema";
import {
  getDoc,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";

import {
  athleteGamificationRef,
  athleteProfileRef,
  settingsRef,
  trainingStateRef,
} from "./refs";
import { toFirestoreData } from "./sanitize";
import { ensureDefaultDistanceRecords } from "./training-records";
import { ensureDefaultRewardsCatalog } from "./training-rewards";

export type BootstrapResult = {
  created: string[];
  existing: string[];
};

async function ensureDocument(
  ref: DocumentReference,
  data: object,
  withCreatedAt: boolean,
): Promise<"created" | "existing"> {
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return "existing";
  }

  const payload = withCreatedAt
    ? { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    : { ...data, updatedAt: serverTimestamp() };

  await setDoc(ref, toFirestoreData(payload));
  return "created";
}

/**
 * Create default settings + Lindsay athlete documents for a new auth user.
 * Idempotent: existing documents are left unchanged.
 */
export async function bootstrapUserDocuments(
  db: Firestore,
  userId: string,
  athleteId: string = DEFAULT_ATHLETE_ID,
): Promise<BootstrapResult> {
  const created: string[] = [];
  const existing: string[] = [];

  const settingsData = createDefaultUserSettings();
  const settingsPath = settingsRef(db, userId);
  const settingsResult = await ensureDocument(settingsPath, settingsData, true);
  (settingsResult === "created" ? created : existing).push("settings/main");

  const profileData = createDefaultAthleteProfile(athleteId);
  const profilePath = athleteProfileRef(db, userId, athleteId);
  const profileResult = await ensureDocument(profilePath, profileData, true);
  (profileResult === "created" ? created : existing).push(
    `athletes/${athleteId}/profile/main`,
  );

  const gamificationData = createDefaultGamification();
  const gamificationPath = athleteGamificationRef(db, userId, athleteId);
  const gamificationResult = await ensureDocument(
    gamificationPath,
    gamificationData,
    false,
  );
  (gamificationResult === "created" ? created : existing).push(
    `athletes/${athleteId}/gamification/main`,
  );

  const trainingData = createDefaultTrainingState();
  const trainingPath = trainingStateRef(db, userId, athleteId);
  const trainingResult = await ensureDocument(trainingPath, trainingData, false);
  (trainingResult === "created" ? created : existing).push(
    `athletes/${athleteId}/training/state`,
  );

  const recordIds = await ensureDefaultDistanceRecords({
    db,
    userId,
    athleteId,
  });
  for (const distanceId of recordIds) {
    created.push(`athletes/${athleteId}/training/main/records/${distanceId}`);
  }

  const catalogCreated = await ensureDefaultRewardsCatalog({
    db,
    userId,
    athleteId,
  });
  if (catalogCreated) {
    created.push(`athletes/${athleteId}/training/main/rewards/catalog`);
  }

  return { created, existing };
}
