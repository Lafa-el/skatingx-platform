import {
  getFirestoreDb,
  normalizeTrainingState,
  runDayRolloverIfNeeded,
} from "@skatingx/firebase-client";
import { todayDateString } from "@skatingx/schema";
import { compareDateStrings } from "@skatingx/skating-domain";
import { useEffect, useRef } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import {
  useFirestoreStatus,
  useTrainingState,
  useUserSettings,
} from "@/app/providers/FirestoreProvider";
import { logActionFailure } from "@/shared/utils/logActionFailure";

/** Runs cross-day task archive once per user/day when training state is loaded. */
export function TrainingDayRollover() {
  const { uid } = useAuth();
  const { ready } = useFirestoreStatus();
  const { data: settings } = useUserSettings();
  const { data: training, loading } = useTrainingState();
  const lastRunKey = useRef<string | null>(null);

  const athleteId = settings?.activeAthleteId ?? "lindsay";

  useEffect(() => {
    if (!uid || !ready || loading || !training) {
      return;
    }

    const state = normalizeTrainingState(training);
    const today = todayDateString();

    if (!state.lastLoginDate || compareDateStrings(today, state.lastLoginDate) <= 0) {
      lastRunKey.current = `${uid}:${today}:noop`;
      return;
    }

    const runKey = `${uid}:${state.lastLoginDate}->${today}`;
    if (lastRunKey.current === runKey) {
      return;
    }

    const db = getFirestoreDb();
    if (!db) {
      return;
    }

    void runDayRolloverIfNeeded(
      { db, userId: uid, athleteId },
      state,
      today,
    )
      .then(() => {
        lastRunKey.current = runKey;
      })
      .catch((error: unknown) => {
        // Background work: there is no click to report to. The run is not marked done, so the
        // next change of the training data tries again.
        logActionFailure("training-rollover", "runDayRolloverIfNeeded", error);
      });
  }, [uid, ready, loading, training, athleteId]);

  return null;
}
