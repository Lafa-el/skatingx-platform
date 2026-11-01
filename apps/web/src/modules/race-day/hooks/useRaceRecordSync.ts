import { startRaceRecordSync } from "@skatingx/firebase-client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useActiveAthlete } from "@/app/providers/FirestoreProvider";

import { logRaceDayError } from "../lib/errors";
import type { RaceRecordSyncState } from "./raceRecordSyncState";
import { useRaceDayContext } from "./useRaceDayData";

/**
 * Keeps the active athlete's training records in line with their confirmed race results
 * (ADR-009). It runs while any Race Day page is open and reacts to the data, not to clicks, so
 * it also covers writes made offline and the cascade of deleting a race, athlete or event.
 *
 * It blocks nothing: a failure is logged and retried by the sync itself, and Race Day keeps
 * working. It also reports, in memory, whether the sync is failing and offers `retry`, which just
 * starts the same sync again; the Results page uses that to show a retry prompt. The listeners
 * and timers are released when the layout unmounts.
 *
 * Two failures are kept apart on purpose. A run failure (`reconcile:*`) is retried by the sync
 * itself, so the next clean report rightly clears it. A subscription failure (`subscribe:*`) is
 * not: that listener is dead for good, and the other rosters keep triggering runs whose clean
 * reports describe only the data that is still arriving. If those reports cleared it, the sync
 * would go on silently with part of its data missing and the retry prompt would vanish. Only a
 * restart of the effect below, that is `retry` or another athlete, can bring a subscription back.
 */
export function useRaceRecordSync(): RaceRecordSyncState {
  const ctx = useRaceDayContext();
  const { athleteId } = useActiveAthlete();
  const [runFailed, setRunFailed] = useState(false);
  const [subscribeFailed, setSubscribeFailed] = useState(false);
  // Bumped by `retry`: a new value restarts the effect below, which is the sync's own entry point.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ctx || !athleteId) {
      return undefined;
    }
    // A new run (another athlete, or a retry) starts without the old run's failures.
    setRunFailed(false);
    setSubscribeFailed(false);
    return startRaceRecordSync(
      { ...ctx, athleteId },
      {
        onError: (operation, error) => {
          logRaceDayError(`recordSync:${operation}`, error);
          if (operation.startsWith("subscribe:")) {
            setSubscribeFailed(true);
          } else {
            setRunFailed(true);
          }
        },
        onReport: (report) => {
          // A run that wrote everything it had to clears the run failure; a failed document keeps
          // it. It never touches `subscribeFailed`: a clean report says nothing about a dead listener.
          if (report.failures.length === 0 && report.unreadable.length === 0) {
            setRunFailed(false);
          }
        },
      },
    );
  }, [ctx, athleteId, attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const failed = runFailed || subscribeFailed;
  return useMemo(() => ({ failed, retry }), [failed, retry]);
}
