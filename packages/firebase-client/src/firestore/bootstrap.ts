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
 * Gamification, training state, default distance records, and the rewards catalog.
 * The same documents a brand-new account gets for its first athlete. Existing documents stay.
 */
export async function provisionAthleteCompanions(
  db: Firestore,
  userId: string,
  athleteId: string,
): Promise<BootstrapResult> {
  const created: string[] = [];
  const existing: string[] = [];

  const gamificationResult = await ensureDocument(
    athleteGamificationRef(db, userId, athleteId),
    createDefaultGamification(),
    false,
  );
  (gamificationResult === "created" ? created : existing).push(
    `athletes/${athleteId}/gamification/main`,
  );

  const trainingResult = await ensureDocument(
    trainingStateRef(db, userId, athleteId),
    createDefaultTrainingState(),
    false,
  );
  (trainingResult === "created" ? created : existing).push(
    `athletes/${athleteId}/training/state`,
  );

  const recordIds = await ensureDefaultDistanceRecords({ db, userId, athleteId });
  for (const distanceId of recordIds) {
    created.push(`athletes/${athleteId}/training/main/records/${distanceId}`);
  }

  const catalogCreated = await ensureDefaultRewardsCatalog({ db, userId, athleteId });
  if (catalogCreated) {
    created.push(`athletes/${athleteId}/training/main/rewards/catalog`);
  }

  return { created, existing };
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

  const profileData = createDefaultAthleteProfile(athleteId, userId);
  const profilePath = athleteProfileRef(db, userId, athleteId);
  const profileResult = await ensureDocument(profilePath, profileData, true);
  (profileResult === "created" ? created : existing).push(
    `athletes/${athleteId}/profile/main`,
  );

  const companions = await provisionAthleteCompanions(db, userId, athleteId);
  created.push(...companions.created);
  existing.push(...companions.existing);

  return { created, existing };
}
