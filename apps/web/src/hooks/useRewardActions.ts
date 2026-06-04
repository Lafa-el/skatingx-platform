import { getFirestoreDb, redeemReward } from "@skatingx/firebase-client";
import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";

export function useRewardActions() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const athleteId = settings?.activeAthleteId ?? "lindsay";

  const redeem = useCallback(
    async (rewardId: string, rewardName: string, cost: number) => {
      if (!uid) {
        throw new Error("Sign in required.");
      }
      const db = getFirestoreDb();
      if (!db) {
        throw new Error("Firestore is not available.");
      }
      setBusy(true);
      setActionError(null);
      setLastSuccess(null);
      try {
        const result = await redeemReward(
          { db, userId: uid, athleteId },
          rewardId,
          rewardName,
          cost,
        );
        setLastSuccess(rewardName);
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Redemption failed.";
        setActionError(message);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [uid, athleteId],
  );

  return {
    redeem,
    busy,
    actionError,
    lastSuccess,
    clearActionError: () => setActionError(null),
    clearLastSuccess: () => setLastSuccess(null),
  };
}
