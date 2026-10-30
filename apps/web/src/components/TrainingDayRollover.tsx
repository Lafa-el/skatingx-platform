import {
  generatePlanTasksIfNeeded,
  getFirestoreDb,
  normalizeTrainingState,
  runDayRolloverIfNeeded,
} from "@skatingx/firebase-client";
import { todayDateString } from "@skatingx/schema";
import { compareDateStrings, planGenerationSkip } from "@skatingx/skating-domain";
import { useEffect, useRef } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import {
  useFirestoreStatus,
  useTrainingState,
  useUserSettings,
} from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { logActionFailure } from "@/shared/utils/logActionFailure";

/**
 * Runs cross-day task archive once per user/day when training state is loaded, and then lays the
 * day's plan tasks on the list (ADR-008 step 2).
 *
 * This is the only place that generates plan tasks. Choosing a focus writes `training/state`, which
 * this component already watches, so "choose a focus and get today's tasks at once" needs no call
 * from the plan page.
 */
export function TrainingDayRollover() {
  const { uid } = useAuth();
  const { ready } = useFirestoreStatus();
  const { data: settings } = useUserSettings();
  const { data: training, loading } = useTrainingState();
  const locale = useLocale();
  const lastRunKey = useRef<string | null>(null);
  // What is being generated right now. A snapshot that arrives meanwhile does not start a second
  // call for the same thing; a different focus does, because the first call will give up on it.
  const generating = useRef<string | null>(null);

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

  useEffect(() => {
    if (!uid || !ready || loading || !training) {
      return;
    }

    const state = normalizeTrainingState(training);
    const focus = state.planFocus;
    const today = todayDateString();
    // The same rules the transaction applies, asked first so a state that needs nothing costs no
    // transaction. The transaction asks again on the server's copy.
    if (!focus || planGenerationSkip(state, focus, today) !== null) {
      return;
    }

    const key = `${uid}:${athleteId}:${today}:${focus}`;
    if (generating.current === key) {
      return;
    }

    const db = getFirestoreDb();
    if (!db) {
      return;
    }

    generating.current = key;
    void (async () => {
      // Loaded here and not at the top: this component is in the first-screen bundle, and the entry
      // table and its copy are the plan module's. Only a user with a focus pays for them.
      const { planCandidatesFor } = await import("@/modules/training/plan/plan-candidates");
      return generatePlanTasksIfNeeded(
        { db, userId: uid, athleteId },
        { focus, candidates: planCandidatesFor(focus, today, locale) },
        today,
      );
    })()
      .catch((error: unknown) => {
        // Same as the rollover: nothing to click, so log it. The marker is not written, so the next
        // change of the training data tries again.
        logActionFailure("training-rollover", "generatePlanTasksIfNeeded", error);
      })
      .finally(() => {
        if (generating.current === key) generating.current = null;
      });
  }, [uid, ready, loading, training, athleteId, locale]);

  return null;
}
