import {
  ensureDefaultRewardsCatalog,
  getFirestoreDb,
  normalizeRewardsCatalog,
  trainingRedemptionsCollectionRef,
  trainingRewardsCatalogRef,
} from "@skatingx/firebase-client";
import type {
  Language,
  RewardRedemption,
  RewardsCatalogDocument,
} from "@skatingx/schema";
import { onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";

export function useRewardsShop() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const athleteId = settings?.activeAthleteId ?? "lindsay";

  const [catalog, setCatalog] = useState<RewardsCatalogDocument | null>(null);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setCatalog(null);
      setRedemptions([]);
      setLoading(false);
      return;
    }

    const db = getFirestoreDb();
    if (!db) {
      setError("Firestore is not available.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void ensureDefaultRewardsCatalog({ db, userId: uid, athleteId }).catch(
      (ensureError) => {
        if (!cancelled) {
          setError(
            ensureError instanceof Error
              ? ensureError.message
              : "Failed to initialize rewards catalog.",
          );
        }
      },
    );

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
        setLoading(false);
      },
      (err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
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
      },
      (err) => {
        if (!cancelled) {
          setError(err.message);
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

  return {
    catalog,
    redemptions,
    latestRedemption,
    loading,
    error,
    isPro: Boolean(settings?.isPro),
    language: (settings?.language === "en" ? "en" : "zh") as Language,
  };
}
