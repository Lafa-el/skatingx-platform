import {
  getFirestoreDb,
  subscribeToRaceEvents,
  subscribeToRoster,
  type InvalidRaceDayDocument,
  type RaceDayContext,
  type RaceDayList,
  type RaceDayListError,
} from "@skatingx/firebase-client";
import type { RaceEvent, RaceRosterEntry } from "@skatingx/schema";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useFirestoreStatus } from "@/hooks/firestore";

import { logRaceDayError } from "../lib/errors";

export type ListState<T> = {
  status: "loading" | "ready" | "error";
  items: T[];
  /** Documents that exist but failed validation; hidden from the list, counted for the user. */
  invalid: InvalidRaceDayDocument[];
  error: RaceDayListError | null;
};

const LOADING: ListState<never> = { status: "loading", items: [], invalid: [], error: null };

/** Null until the user is signed in and the Firestore bootstrap has finished. */
export function useRaceDayContext(): RaceDayContext | null {
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

type Subscribe<T> = (
  onData: (list: RaceDayList<T>) => void,
  onError: (error: RaceDayListError) => void,
) => () => void;

/** Subscribes while mounted and always releases the listener on unmount or when inputs change. */
function useSubscribedList<T>(subscribe: Subscribe<T> | null): ListState<T> {
  const [state, setState] = useState<ListState<T>>(LOADING);

  useEffect(() => {
    if (!subscribe) {
      setState(LOADING);
      return undefined;
    }
    setState(LOADING);
    return subscribe(
      (list) => {
        setState({ status: "ready", items: list.items, invalid: list.invalid, error: null });
      },
      (error) => {
        logRaceDayError("subscribe", error);
        setState({ status: "error", items: [], invalid: [], error });
      },
    );
  }, [subscribe]);

  return state;
}

export function useRaceEvents(ctx: RaceDayContext | null): ListState<RaceEvent> {
  const subscribe = useMemo<Subscribe<RaceEvent> | null>(
    () => (ctx ? (onData, onError) => subscribeToRaceEvents(ctx, onData, onError) : null),
    [ctx],
  );
  return useSubscribedList(subscribe);
}

export function useRoster(
  ctx: RaceDayContext | null,
  eventId: string | null,
): ListState<RaceRosterEntry> {
  const subscribe = useMemo<Subscribe<RaceRosterEntry> | null>(
    () =>
      ctx && eventId
        ? (onData, onError) => subscribeToRoster(ctx, eventId, onData, onError)
        : null,
    [ctx, eventId],
  );
  return useSubscribedList(subscribe);
}
