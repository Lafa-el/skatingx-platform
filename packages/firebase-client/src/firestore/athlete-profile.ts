import {
  deleteField,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";

import { athleteProfileRef } from "./refs";

/** The fields the profile form edits. Other profile fields stay because the write merges. */
export type AthleteProfilePatch = {
  displayName: string;
  birthDate: string;
  skatingStartDate: string;
  sport: string;
  country: string;
  bio: string;
};

/**
 * Merge the form onto the profile. A blank start date or bio removes that field, so the card
 * shows the same dash it shows when the field was never stored. `skatingDivision` is not in
 * the patch, so a merge leaves it in place.
 */
export async function updateAthleteProfile(
  db: Firestore,
  userId: string,
  athleteId: string,
  patch: AthleteProfilePatch,
): Promise<void> {
  const start = patch.skatingStartDate.trim();
  const bio = patch.bio.trim();
  await setDoc(
    athleteProfileRef(db, userId, athleteId),
    {
      displayName: patch.displayName.trim(),
      birthDate: patch.birthDate.trim(),
      skatingStartDate: start === "" ? deleteField() : start,
      sport: patch.sport,
      country: patch.country.trim(),
      bio: bio === "" ? deleteField() : bio,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
