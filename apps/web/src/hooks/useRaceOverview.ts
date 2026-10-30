import {
  getFirestoreDb,
  subscribeToRaceEvents,
  subscribeToRaceResults,
  subscribeToRaces,
  subscribeToRoster,
  type RaceDayContext,
  type RaceDayList,
  type RaceDayListError,
} from "@skatingx/firebase-client";
import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import {
  ownRosterEntry,
  pickNextAndPreviousEvents,
  recentOwnResults,
  todayDateString,
  type OverviewEventPick,
  type OverviewResultRow,
} from "@skatingx/skating-domain";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useFirestoreStatus } from "@/hooks/firestore";

/**
 * Read-only data for the dashboard's Race Day card: the event list, and for the one next and the
 * one previous event only what the card shows. It writes nothing.
 *
 * At most five listeners run at once: the event list, the next event's roster, and the previous
 * event's roster, schedule and results. All of them are released when the card unmounts or the
 * chosen event changes. It does not import the Race Day module, so that module stays lazy.
 *
 * Mount it only behind `isRaceDayEnabled()`: with the flag off nothing is subscribed.
 */

export type RaceOverviewDetail = "loading" | "ready" | "error";

export type RaceOverviewNext = {
  pick: OverviewEventPick<RaceEvent>;
  /** The own athlete's division; null when there is no own roster row or it has no division. */
  division: string | null;
  detail: RaceOverviewDetail;
};

export type RaceOverviewPrevious = {
  pick: OverviewEventPick<RaceEvent>;
  results: OverviewResultRow[];
  detail: RaceOverviewDetail;
};

export type RaceOverview =
  | { status: "loading" }
  | { status: "error"; permissionDenied: boolean }
  | {
      status: "ready";
      /** Events that were read and valid, including ones that take no part (no valid day). */
      eventCount: number;
      /** Event documents that exist but failed validation, so they are not counted anywhere. */
      hiddenCount: number;
      next: RaceOverviewNext | null;
      previous: RaceOverviewPrevious | null;
    };

type ListState<T> = {
  key: string;
  status: "loading" | "ready" | "error";
  items: T[];
  invalidCount: number;
  errorCode: string | null;
};

type Subscribe<T> = (
  onData: (list: RaceDayList<T>) => void,
  onError: (error: RaceDayListError) => void,
) => () => void;

function loadingState<T>(key: string): ListState<T> {
  return { key, status: "loading", items: [], invalidCount: 0, errorCode: null };
}

/**
 * Subscribes while `subscribe` is set and always releases on change or unmount. State is tagged
 * with its key, so a list that belongs to the previous event is never shown for the new one.
 */
function useSubscribedList<T>(key: string, subscribe: Subscribe<T> | null): ListState<T> {
  const [state, setState] = useState<ListState<T>>(() => loadingState(key));

  useEffect(() => {
    if (!subscribe) {
      return undefined;
    }
    setState(loadingState(key));
    return subscribe(
      (list) => {
        setState({ key, status: "ready", items: list.items, invalidCount: list.invalid.length, errorCode: null });
      },
      (error) => {
        // The code is enough to diagnose; the message can contain document paths.
        console.error("[dashboard] race overview read failed", { listener: key, code: error.code });
        setState({ key, status: "error", items: [], invalidCount: 0, errorCode: error.code });
      },
    );
  }, [key, subscribe]);

  return subscribe && state.key === key ? state : loadingState(key);
}

function detailOf(...lists: readonly ListState<unknown>[]): RaceOverviewDetail {
  if (lists.some((list) => list.status === "error")) {
    return "error";
  }
  return lists.every((list) => list.status === "ready") ? "ready" : "loading";
}

/** The calendar and the countdown follow the clock; a minute is fine-grained enough for days. */
function useMinuteClock(): string {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date().toISOString());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

function useOverviewContext(): RaceDayContext | null {
  const { uid } = useAuth();
  const { ready } = useFirestoreStatus();
  return useMemo(() => {
    if (!ready || !uid) {
      return null;
    }
    const db = getFirestoreDb();
    return db ? { db, userId: uid } : null;
  }, [ready, uid]);
}

export function useRaceOverview(): RaceOverview {
  const ctx = useOverviewContext();
  const now = useMinuteClock();

  const eventsSubscribe = useMemo<Subscribe<RaceEvent> | null>(
    () => (ctx ? (onData, onError) => subscribeToRaceEvents(ctx, onData, onError) : null),
    [ctx],
  );
  const events = useSubscribedList("events", eventsSubscribe);

  const picks = useMemo(
    () =>
      events.status === "ready"
        ? pickNextAndPreviousEvents(events.items, now, todayDateString(new Date(now)))
        : null,
    [events.status, events.items, now],
  );
  const nextId = picks?.next?.event.eventId ?? null;
  const previousId = picks?.previous?.event.eventId ?? null;

  // The next event needs only the roster (for the division); the previous one needs its results.
  const nextRoster = useSubscribedList(
    `next-roster:${nextId ?? ""}`,
    useMemo<Subscribe<RaceRosterEntry> | null>(
      () => (ctx && nextId ? (onData, onError) => subscribeToRoster(ctx, nextId, onData, onError) : null),
      [ctx, nextId],
    ),
  );
  const previousRoster = useSubscribedList(
    `previous-roster:${previousId ?? ""}`,
    useMemo<Subscribe<RaceRosterEntry> | null>(
      () =>
        ctx && previousId ? (onData, onError) => subscribeToRoster(ctx, previousId, onData, onError) : null,
      [ctx, previousId],
    ),
  );
  const previousRaces = useSubscribedList(
    `previous-races:${previousId ?? ""}`,
    useMemo<Subscribe<RaceEntry> | null>(
      () =>
        ctx && previousId ? (onData, onError) => subscribeToRaces(ctx, previousId, onData, onError) : null,
      [ctx, previousId],
    ),
  );
  const previousResults = useSubscribedList(
    `previous-results:${previousId ?? ""}`,
    useMemo<Subscribe<RaceResult> | null>(
      () =>
        ctx && previousId
          ? (onData, onError) => subscribeToRaceResults(ctx, previousId, onData, onError)
          : null,
      [ctx, previousId],
    ),
  );

  const previousRows = useMemo(
    () =>
      previousId
        ? recentOwnResults({
            results: previousResults.items,
            races: previousRaces.items,
            roster: previousRoster.items,
          })
        : [],
    [previousId, previousResults.items, previousRaces.items, previousRoster.items],
  );

  if (events.status === "error") {
    return {
      status: "error",
      permissionDenied: events.errorCode === "permission-denied" || events.errorCode === "unauthenticated",
    };
  }
  if (!picks) {
    return { status: "loading" };
  }

  return {
    status: "ready",
    eventCount: events.items.length,
    hiddenCount: events.invalidCount,
    next: picks.next
      ? {
          pick: picks.next,
          division: ownRosterEntry(nextRoster.items)?.division.trim() || null,
          detail: detailOf(nextRoster),
        }
      : null,
    previous: picks.previous
      ? {
          pick: picks.previous,
          results: previousRows,
          detail: detailOf(previousRoster, previousRaces, previousResults),
        }
      : null,
  };
}
