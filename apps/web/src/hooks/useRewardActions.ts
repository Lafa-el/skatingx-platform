import { getFirestoreDb, redeemReward } from "@skatingx/firebase-client";
import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { tShop } from "@/shared/i18n/shop-messages";

/** What was redeemed: the page shows the reward's name in the language it has when it reads this. */
export type RedeemedReward = { rewardId: string; rewardName: string };

export function useRewardActions() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const [busy, setBusy] = useState(false);
  // A message from the data layer is kept as it arrived; otherwise nothing is kept and the sentence
  // is written in the current language when it is read.
  const [received, setReceived] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<RedeemedReward | null>(null);
  const language = useLocale();
  const actionError = received ?? (failed ? tShop(language, "shop.error.redeemFailed") : null);

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
      setReceived(null);
      setFailed(false);
      setLastSuccess(null);
      try {
        const result = await redeemReward(
          { db, userId: uid, athleteId },
          rewardId,
          rewardName,
          cost,
        );
        setLastSuccess({ rewardId, rewardName });
        return result;
      } catch (error) {
        if (error instanceof Error) {
          setReceived(error.message);
        } else {
          setFailed(true);
        }
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
    clearActionError: () => {
      setReceived(null);
      setFailed(false);
    },
    clearLastSuccess: () => setLastSuccess(null),
  };
}
