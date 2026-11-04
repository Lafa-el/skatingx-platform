import { createIdSuffix, createRaceDayEntityId } from "@skatingx/skating-domain";
import { getDoc, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";

import { provisionAthleteCompanions } from "./bootstrap";
import { athleteProfileRef } from "./refs";
import { updateUserSettings } from "./settings";
import type { AthleteProfilePatch } from "./athlete-profile";

const ID_ATTEMPTS = 3;

/** Three candidate ids were already stored. Nothing was written. */
export class AthleteIdCollisionError extends Error {
  constructor() {
    super("athlete-id-collision");
    this.name = "AthleteIdCollisionError";
  }
}

/**
 * Create a new athlete from the profile form and make that athlete the active one.
 * A blank start date or bio is left off the document, so the card shows a dash.
 * Companion documents match the ones bootstrap creates for the first athlete.
 */
export async function createAthlete(
  db: Firestore,
  userId: string,
  patch: AthleteProfilePatch,
): Promise<string> {
  const athleteId = await unusedAthleteId(db, userId, patch.displayName);
  const start = patch.skatingStartDate.trim();
  const bio = patch.bio.trim();
  const profile: Record<string, unknown> = {
    athleteId,
    displayName: patch.displayName.trim(),
    birthDate: patch.birthDate.trim(),
    sport: patch.sport,
    country: patch.country.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (start !== "") {
    profile.skatingStartDate = start;
  }
  if (bio !== "") {
    profile.bio = bio;
  }
  await setDoc(athleteProfileRef(db, userId, athleteId), profile);
  await provisionAthleteCompanions(db, userId, athleteId);
  await updateUserSettings(db, userId, { activeAthleteId: athleteId });
  return athleteId;
}

async function unusedAthleteId(db: Firestore, userId: string, displayName: string): Promise<string> {
  for (let attempt = 0; attempt < ID_ATTEMPTS; attempt += 1) {
    const athleteId = createRaceDayEntityId(displayName, createIdSuffix());
    const snap = await getDoc(athleteProfileRef(db, userId, athleteId));
    if (!snap.exists()) {
      return athleteId;
    }
  }
  throw new AthleteIdCollisionError();
}
