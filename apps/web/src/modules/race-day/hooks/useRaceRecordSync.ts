import { startRaceRecordSync } from "@skatingx/firebase-client";
import { useEffect } from "react";

import { useActiveAthlete } from "@/app/providers/FirestoreProvider";

import { logRaceDayError } from "../lib/errors";
import { useRaceDayContext } from "./useRaceDayData";

/**
 * Keeps the active athlete's training records in line with their confirmed race results
 * (ADR-009). It runs while any Race Day page is open and reacts to the data, not to clicks, so
 * it also covers writes made offline and the cascade of deleting a race, athlete or event.
 *
 * It shows nothing and blocks nothing: a failure is logged and retried, and Race Day itself
 * keeps working. The listeners and timers are released when the layout unmounts.
 */
export function useRaceRecordSync(): void {
  const ctx = useRaceDayContext();
  const { athleteId } = useActiveAthlete();

  useEffect(() => {
    if (!ctx || !athleteId) {
      return undefined;
    }
    return startRaceRecordSync(
      { ...ctx, athleteId },
      { onError: (operation, error) => logRaceDayError(`recordSync:${operation}`, error) },
    );
  }, [ctx, athleteId]);
}
