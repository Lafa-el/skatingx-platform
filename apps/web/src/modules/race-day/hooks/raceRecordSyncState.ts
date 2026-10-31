import { createContext, useContext } from "react";

/**
 * What the Results page may know about the background records sync (ADR-009). In memory only:
 * nothing here is stored, and the error behind `failed` goes to the log, never to this state.
 */
export type RaceRecordSyncState = {
  /** The last run did not finish cleanly (a read or a write failed). Cleared by a clean run. */
  readonly failed: boolean;
  /** Runs the same sync again (stops it and starts it afresh); there is no second sync path. */
  readonly retry: () => void;
};

export const IDLE_RECORD_SYNC: RaceRecordSyncState = { failed: false, retry: () => undefined };

export const RaceRecordSyncContext = createContext<RaceRecordSyncState>(IDLE_RECORD_SYNC);

export function useRaceRecordSyncState(): RaceRecordSyncState {
  return useContext(RaceRecordSyncContext);
}
