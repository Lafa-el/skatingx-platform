import {
  createRace,
  createRaceEvent,
  createRaceEventWithRaces,
  deleteRace,
  createRosterEntry,
  deleteRaceEvent,
  deleteRosterEntry,
  setRaceEventVerified,
  setRaceVerified,
  setRosterEntryVerified,
  updateRace,
  updateRaceEvent,
  updateRosterEntry,
  type RaceDayContext,
} from "@skatingx/firebase-client";
import {
  createIdSuffix,
  createRaceDayEntityId,
  type RaceDayTemplate,
  type RaceEventInput,
  type RaceInput,
  type RosterEntryInput,
} from "@skatingx/skating-domain";
import { useCallback, useMemo, useState } from "react";

import { logRaceDayError } from "../lib/errors";
import { settleWrite, type WriteOutcome } from "../lib/write";

export type RaceDayActions = {
  /** Resolves with the new id as soon as the write is saved or queued locally. */
  createEvent: (input: RaceEventInput) => Promise<{ eventId: string; outcome: WriteOutcome }>;
  updateEvent: (eventId: string, input: RaceEventInput) => Promise<WriteOutcome>;
  setEventVerified: (eventId: string, verified: boolean) => Promise<WriteOutcome>;
  deleteEvent: (eventId: string) => Promise<WriteOutcome>;
  createRoster: (eventId: string, input: RosterEntryInput) => Promise<WriteOutcome>;
  updateRoster: (eventId: string, rosterId: string, input: RosterEntryInput) => Promise<WriteOutcome>;
  setRosterVerified: (eventId: string, rosterId: string, verified: boolean) => Promise<WriteOutcome>;
  deleteRoster: (eventId: string, rosterId: string) => Promise<WriteOutcome>;
  createRace: (eventId: string, input: RaceInput) => Promise<WriteOutcome>;
  updateRace: (eventId: string, raceId: string, input: RaceInput) => Promise<WriteOutcome>;
  setRaceVerified: (eventId: string, raceId: string, verified: boolean) => Promise<WriteOutcome>;
  deleteRace: (eventId: string, raceId: string) => Promise<WriteOutcome>;
  /** Event and races in one batch: all or nothing. Returns the event id to select. */
  applyTemplate: (template: RaceDayTemplate) => Promise<{ eventId: string; outcome: WriteOutcome }>;
};

/**
 * Writes for the Setup page. Every write goes through `settleWrite`, so the UI is never stuck
 * waiting for a server that is out of reach. A write the server rejects after we already
 * reported it as queued sets `syncFailed`, which the page shows.
 */
export function useRaceDayActions(ctx: RaceDayContext | null): {
  actions: RaceDayActions | null;
  syncFailed: boolean;
  clearSyncFailed: () => void;
} {
  const [syncFailed, setSyncFailed] = useState(false);

  const run = useCallback(
    (operation: string, write: Promise<unknown>) =>
      settleWrite(write, {
        onLateError: (error) => {
          logRaceDayError(`${operation} (after queued)`, error);
          setSyncFailed(true);
        },
      }),
    [],
  );

  const actions = useMemo<RaceDayActions | null>(() => {
    if (!ctx) {
      return null;
    }
    return {
      createEvent: async (input) => {
        // The id is chosen here, not by the repository, so the UI can select the new event
        // immediately even while the write is still queued offline.
        const eventId = createRaceDayEntityId(input.name, createIdSuffix());
        const outcome = await run("createEvent", createRaceEvent(ctx, input, { eventId }));
        return { eventId, outcome };
      },
      updateEvent: (eventId, input) => run("updateEvent", updateRaceEvent(ctx, eventId, input)),
      setEventVerified: (eventId, verified) =>
        run("setEventVerified", setRaceEventVerified(ctx, eventId, verified)),
      deleteEvent: (eventId) => run("deleteEvent", deleteRaceEvent(ctx, eventId)),
      createRoster: (eventId, input) =>
        run("createRoster", createRosterEntry(ctx, eventId, input)),
      updateRoster: (eventId, rosterId, input) =>
        run("updateRoster", updateRosterEntry(ctx, eventId, rosterId, input)),
      setRosterVerified: (eventId, rosterId, verified) =>
        run("setRosterVerified", setRosterEntryVerified(ctx, eventId, rosterId, verified)),
      deleteRoster: (eventId, rosterId) =>
        run("deleteRoster", deleteRosterEntry(ctx, eventId, rosterId)),
      createRace: (eventId, input) => run("createRace", createRace(ctx, eventId, input)),
      updateRace: (eventId, raceId, input) =>
        run("updateRace", updateRace(ctx, eventId, raceId, input)),
      setRaceVerified: (eventId, raceId, verified) =>
        run("setRaceVerified", setRaceVerified(ctx, eventId, raceId, verified)),
      deleteRace: (eventId, raceId) => run("deleteRace", deleteRace(ctx, eventId, raceId)),
      applyTemplate: async (template) => {
        const outcome = await run(
          "applyTemplate",
          createRaceEventWithRaces(ctx, template.eventId, template.event, template.races),
        );
        return { eventId: template.eventId, outcome };
      },
    };
  }, [ctx, run]);

  const clearSyncFailed = useCallback(() => {
    setSyncFailed(false);
  }, []);

  return { actions, syncFailed, clearSyncFailed };
}
