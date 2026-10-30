import { subscribeToRaceRecordEntries } from "@skatingx/firebase-client";
import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { deriveResultSyncInfo, type ResultSyncInfo, type StoredRaceEntry } from "@skatingx/skating-domain";
import { useEffect, useMemo, useRef, useState } from "react";

import { useActiveAthlete } from "@/app/providers/FirestoreProvider";

import { logRaceDayError } from "../lib/errors";
import { useRaceDayContext } from "./useRaceDayData";

type Recorded =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly entries: ReadonlyMap<string, StoredRaceEntry> };

const NO_INFO: ReadonlyMap<string, ResultSyncInfo> = new Map();

/**
 * Read-only. What each result row can say about the records sync (design 2.a "visible state"):
 * recorded, waiting, or why it is not recorded. One listener on the active athlete's records,
 * released when the Results page unmounts. It writes nothing.
 *
 * While the records are loading or could not be read, a row that would be recorded shows nothing
 * (it must not pass for "recorded" or "waiting" on a guess); a read failure is logged once.
 */
export function useResultSyncInfo(input: {
  event: Pick<RaceEvent, "eventId" | "name" | "dates"> | null;
  races: readonly RaceEntry[];
  roster: readonly RaceRosterEntry[];
  results: readonly RaceResult[];
}): ReadonlyMap<string, ResultSyncInfo> {
  const ctx = useRaceDayContext();
  const { athleteId } = useActiveAthlete();
  const userId = ctx?.userId ?? null;
  // Tagged with who it was read for, so another athlete's records are never shown for this one.
  const [read, setRead] = useState<{ readonly key: string; readonly recorded: Recorded } | null>(null);
  const key = userId && athleteId ? `${userId}|${athleteId}` : "";

  useEffect(() => {
    if (!ctx || !athleteId) {
      return undefined;
    }
    const readKey = `${ctx.userId}|${athleteId}`;
    setRead({ key: readKey, recorded: { status: "loading" } });
    return subscribeToRaceRecordEntries(
      { ...ctx, athleteId },
      (entries) => {
        const byId = new Map<string, StoredRaceEntry>();
        for (const entry of entries) {
          byId.set(String(entry.id), entry);
        }
        setRead({ key: readKey, recorded: { status: "ready", entries: byId } });
      },
      (error) => {
        logRaceDayError("resultSync:readRecords", error);
        setRead({ key: readKey, recorded: { status: "error" } });
      },
    );
  }, [ctx, athleteId]);

  const derivation = useMemo(() => {
    if (!input.event || !athleteId) {
      return null;
    }
    // Records not read yet, failed, or read for someone else: unknown, never guessed.
    const recorded = read && read.key === key && read.recorded.status === "ready" ? read.recorded.entries : null;
    return deriveResultSyncInfo({
      event: input.event,
      races: input.races,
      roster: input.roster,
      results: input.results,
      athleteId,
      recorded,
    });
  }, [input.event, input.races, input.roster, input.results, athleteId, read, key]);

  // States that should not exist are logged for developers, by reason only (an id can carry a name).
  const logged = useRef(new Set<string>());
  useEffect(() => {
    for (const { resultId, reason } of derivation?.unexpected ?? []) {
      const marker = `${resultId}|${reason}`;
      if (!logged.current.has(marker)) {
        logged.current.add(marker);
        console.error("[race-day] resultSync: unexpected row state", { reason });
      }
    }
  }, [derivation]);

  return derivation?.byResultId ?? NO_INFO;
}
