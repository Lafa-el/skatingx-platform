import { redeemReward } from "@skatingx/firebase-client";
import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { type ShopMessageKey, tShop } from "@/shared/i18n/shop-messages";

import { ActionPreconditionError, requireActor } from "./actionPrecondition";

/** What was redeemed: the page shows the reward's name in the language it has when it reads this. */
export type RedeemedReward = { rewardId: string; rewardName: string };

export function useRewardActions() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const [busy, setBusy] = useState(false);
  // What happened, not the sentence, so the message follows the language if it changes. A message
  // from the data layer is kept as it arrived.
  const [errorNote, setErrorNote] = useState<
    { key: ShopMessageKey } | { received: string } | null
  >(null);
  const [lastSuccess, setLastSuccess] = useState<RedeemedReward | null>(null);
  const language = useLocale();
  const actionError = errorNote
    ? "received" in errorNote
      ? errorNote.received
      : tShop(language, errorNote.key)
    : null;

  const athleteId = settings?.activeAthleteId ?? "lindsay";

  const redeem = useCallback(
    async (rewardId: string, rewardName: string, cost: number) => {
      setBusy(true);
      setErrorNote(null);
      setLastSuccess(null);
      try {
        // Inside the try: "not signed in" and "no data service" are shown to the user too.
        const result = await redeemReward(
          { ...requireActor(uid), athleteId },
          rewardId,
          rewardName,
          cost,
        );
        setLastSuccess({ rewardId, rewardName });
        return result;
      } catch (error) {
        setErrorNote(
          error instanceof ActionPreconditionError
            ? {
                key:
                  error.kind === "notSignedIn"
                    ? "shop.error.notSignedIn"
                    : "shop.error.unavailable",
              }
            : error instanceof Error
              ? { received: error.message }
              : { key: "shop.error.redeemFailed" },
        );
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
    clearActionError: () => setErrorNote(null),
    clearLastSuccess: () => setLastSuccess(null),
  };
}
