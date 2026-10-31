import {
  ensureDefaultRewardsCatalog,
  getFirestoreDb,
  normalizeRewardsCatalog,
  trainingRedemptionsCollectionRef,
  trainingRewardsCatalogRef,
} from "@skatingx/firebase-client";
import type {
  RewardRedemption,
  RewardsCatalogDocument,
} from "@skatingx/schema";
import { onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { type ShopMessageKey, tShop } from "@/shared/i18n/shop-messages";
import { toLocale } from "@/shared/i18n/translator";

/**
 * What the user is told when loading the shop fails. It keeps what happened, not the sentence, so
 * it follows the language if that changes afterwards. A message that came from the data layer is
 * shown as it arrived.
 */
type ShopErrorNote = { key: ShopMessageKey } | { received: string };

export function useRewardsShop() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const athleteId = settings?.activeAthleteId ?? "lindsay";

  const [catalog, setCatalog] = useState<RewardsCatalogDocument | null>(null);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorNote, setErrorNote] = useState<ShopErrorNote | null>(null);

  useEffect(() => {
    if (!uid) {
      setCatalog(null);
      setRedemptions([]);
      setLoading(false);
      return;
    }

    const db = getFirestoreDb();
    if (!db) {
      setErrorNote({ key: "shop.error.unavailable" });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorNote(null);

    void ensureDefaultRewardsCatalog({ db, userId: uid, athleteId }).catch(
      (ensureError) => {
        if (!cancelled) {
          setErrorNote(
            ensureError instanceof Error
              ? { received: ensureError.message }
              : { key: "shop.error.catalogFailed" },
          );
        }
      },
    );

    // Loading ends only when both listeners have settled (data or failure). Ending it on the
    // catalog alone let consumers show "no redemptions" while the redemptions were still on the way.
    let catalogSettled = false;
    let redemptionsSettled = false;
    const settleIfBoth = () => {
      if (!cancelled && catalogSettled && redemptionsSettled) {
        setLoading(false);
      }
    };

    const catalogRef = trainingRewardsCatalogRef(db, uid, athleteId);
    const redemptionsRef = trainingRedemptionsCollectionRef(db, uid, athleteId);

    const unsubCatalog = onSnapshot(
      catalogRef,
      (snap) => {
        if (cancelled) return;
        setCatalog(
          normalizeRewardsCatalog(
            snap.data() as RewardsCatalogDocument | undefined,
          ),
        );
        catalogSettled = true;
        settleIfBoth();
      },
      (err) => {
        if (!cancelled) {
          setErrorNote({ received: err.message });
          catalogSettled = true;
          settleIfBoth();
        }
      },
    );

    const unsubRedemptions = onSnapshot(
      redemptionsRef,
      (snap) => {
        if (cancelled) return;
        const list: RewardRedemption[] = [];
        snap.forEach((docSnap) => {
          list.push(docSnap.data() as RewardRedemption);
        });
        setRedemptions(list);
        redemptionsSettled = true;
        settleIfBoth();
      },
      (err) => {
        if (!cancelled) {
          setErrorNote({ received: err.message });
          redemptionsSettled = true;
          settleIfBoth();
        }
      },
    );

    return () => {
      cancelled = true;
      unsubCatalog();
      unsubRedemptions();
    };
  }, [uid, athleteId]);

  const latestRedemption = useMemo(() => {
    if (redemptions.length === 0) return null;
    return [...redemptions].sort((a, b) =>
      b.redeemedAt.localeCompare(a.redeemedAt),
    )[0];
  }, [redemptions]);

  const language = toLocale(settings?.language);
  const error = errorNote
    ? "received" in errorNote
      ? errorNote.received
      : tShop(language, errorNote.key)
    : null;

  return {
    catalog,
    redemptions,
    latestRedemption,
    loading,
    error,
    language,
  };
}
