import {
  ensureDefaultDistanceRecords,
  getFirestoreDb,
  readDistanceRecordsDocument,
  trainingRecordsCollectionRef,
} from "@skatingx/firebase-client";
import {
  DEFAULT_TRAINING_DISTANCES,
  type DistanceRecordsDocument,
} from "@skatingx/schema";
import {
  getBestTime,
  getLatestTime,
  sortRecordsByDate,
} from "@skatingx/skating-domain";
import { onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { type RecordsMessageKey, tRecords } from "@/shared/i18n/records-messages";

/**
 * What the user is told when loading the records fails. It keeps what happened, not the sentence,
 * so it follows the language if that changes afterwards. A message that came from the data layer
 * is shown as it arrived.
 */
type RecordsErrorNote = { key: RecordsMessageKey } | { received: string };

export type DistanceRecordsMap = Record<string, DistanceRecordsDocument>;

export function useTrainingRecords() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const athleteId = settings?.activeAthleteId ?? "lindsay";

  const [recordsByDistance, setRecordsByDistance] = useState<DistanceRecordsMap>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [errorNote, setErrorNote] = useState<RecordsErrorNote | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  useEffect(() => {
    if (!uid) {
      setRecordsByDistance({});
      setLoading(false);
      return;
    }

    const db = getFirestoreDb();
    if (!db) {
      setErrorNote({ key: "records.error.unavailable" });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorNote(null);

    void (async () => {
      try {
        setEnsuring(true);
        await ensureDefaultDistanceRecords({ db, userId: uid, athleteId });
      } catch (ensureError) {
        if (!cancelled) {
          setErrorNote(
            ensureError instanceof Error
              ? { received: ensureError.message }
              : { key: "records.error.loadFailed" },
          );
        }
      } finally {
        if (!cancelled) {
          setEnsuring(false);
        }
      }
    })();

    const collectionRef = trainingRecordsCollectionRef(db, uid, athleteId);
    const unsubscribe = onSnapshot(
      collectionRef,
      (snapshot) => {
        if (cancelled) {
          return;
        }
        const labelById = new Map(
          DEFAULT_TRAINING_DISTANCES.map((d) => [d.distanceId, d.label]),
        );
        const next: DistanceRecordsMap = {};

        for (const distance of DEFAULT_TRAINING_DISTANCES) {
          next[distance.distanceId] = readDistanceRecordsDocument(
            distance.distanceId,
            distance.label,
            undefined,
          );
        }

        snapshot.forEach((docSnap) => {
          const distanceId = docSnap.id;
          const label =
            labelById.get(distanceId) ??
            (docSnap.data().label as string) ??
            distanceId;
          next[distanceId] = readDistanceRecordsDocument(
            distanceId,
            label,
            docSnap.data() as DistanceRecordsDocument,
          );
        });

        setRecordsByDistance(next);
        setLoading(false);
        setErrorNote(null);
      },
      (snapshotError) => {
        if (!cancelled) {
          setErrorNote({ received: snapshotError.message });
          setLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid, athleteId]);

  const language = useLocale();
  const error = errorNote
    ? "received" in errorNote
      ? errorNote.received
      : tRecords(language, errorNote.key)
    : null;

  const distances = useMemo(
    () =>
      DEFAULT_TRAINING_DISTANCES.map((d) => ({
        ...d,
        document: recordsByDistance[d.distanceId],
      })),
    [recordsByDistance],
  );

  const getDocument = useCallback(
    (distanceId: string) => recordsByDistance[distanceId],
    [recordsByDistance],
  );

  const getSortedEntries = useCallback(
    (distanceId: string) => {
      const doc = recordsByDistance[distanceId];
      return sortRecordsByDate(doc?.entries ?? []);
    },
    [recordsByDistance],
  );

  const getBestForDistance = useCallback(
    (distanceId: string) => getBestTime(recordsByDistance[distanceId]?.entries ?? []),
    [recordsByDistance],
  );

  const getLatestForDistance = useCallback(
    (distanceId: string) =>
      getLatestTime(recordsByDistance[distanceId]?.entries ?? []),
    [recordsByDistance],
  );

  const totalEntryCount = useMemo(
    () =>
      Object.values(recordsByDistance).reduce(
        (sum, doc) => sum + (doc?.entries.length ?? 0),
        0,
      ),
    [recordsByDistance],
  );

  const latestEntryOverall = useMemo(() => {
    let latest: ReturnType<typeof getLatestTime> = null;
    for (const distance of DEFAULT_TRAINING_DISTANCES) {
      const candidate = getLatestTime(
        recordsByDistance[distance.distanceId]?.entries ?? [],
      );
      if (!candidate) {
        continue;
      }
      if (
        !latest ||
        candidate.date > latest.date ||
        (candidate.date === latest.date &&
          (candidate.createdAt || "") > (latest.createdAt || ""))
      ) {
        latest = candidate;
      }
    }
    return latest;
  }, [recordsByDistance]);

  return {
    athleteId,
    recordsByDistance,
    distances,
    loading: loading || ensuring,
    error,
    getDocument,
    getSortedEntries,
    getBestForDistance,
    getLatestForDistance,
    totalEntryCount,
    latestEntryOverall,
  };
}
