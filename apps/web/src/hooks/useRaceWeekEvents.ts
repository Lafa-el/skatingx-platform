import { getFirestoreDb } from "@skatingx/firebase-client";
import type { RaceEvent } from "@skatingx/schema";
import { useEffect, useState } from "react";

import { isRaceDayEnabled } from "@/app/features";
import { useAuth } from "@/app/providers/AuthProvider";
import { logActionFailure } from "@/shared/utils/logActionFailure";

/**
 * Read-only: the user's Race Day events, for the plan page's race-week suggestion. One listener,
 * released when the page unmounts. It writes nothing and does not import the Race Day module.
 *
 * - `off`: the feature flag is off. Nothing is subscribed and nothing is downloaded.
 * - `loading`: not read yet (also while the user or the database is not ready).
 * - `error`: the read failed, including permission denied. It is never the same as "no event".
 */
export type RaceWeekEvents =
  | { readonly status: "off" }
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly events: readonly RaceEvent[] };

type Read =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly events: readonly RaceEvent[] };

export function useRaceWeekEvents(): RaceWeekEvents {
  const enabled = isRaceDayEnabled();
  const { uid } = useAuth();
  // Tagged with the user it was read for, so another user's events are never shown for this one.
  const [read, setRead] = useState<{ readonly uid: string; readonly result: Read } | null>(null);

  useEffect(() => {
    if (!enabled || !uid) return undefined;
    const db = getFirestoreDb();
    if (!db) return undefined;

    let released = false;
    let stop: (() => void) | null = null;
    setRead({ uid, result: { status: "loading" } });

    import("./raceWeekSubscribe")
      .then(({ subscribeRaceWeekEvents }) => {
        if (released) return;
        stop = subscribeRaceWeekEvents(
          { db, userId: uid },
          (list) => {
            setRead({ uid, result: { status: "ready", events: list.items } });
          },
          (error) => {
            // The code is enough to diagnose; the message can contain document paths.
            logActionFailure("training-plan", "read-race-events", error);
            setRead({ uid, result: { status: "error" } });
          },
        );
      })
      .catch((error: unknown) => {
        // The code could not be downloaded (offline, or a stale deployment).
        if (released) return;
        logActionFailure("training-plan", "load-race-events", error);
        setRead({ uid, result: { status: "error" } });
      });

    return () => {
      released = true;
      stop?.();
      stop = null;
    };
  }, [enabled, uid]);

  if (!enabled) return { status: "off" };
  if (!read || read.uid !== uid) return { status: "loading" };
  return read.result;
}
