import {
  getFirestoreDb,
  subscribeToRaceEvents,
  subscribeToRaces,
  subscribeToRaceVideos,
} from "@skatingx/firebase-client";
import type { RaceEntry, RaceEvent, RaceVideoRef } from "@skatingx/schema";
import type { RaceVideoLink } from "@skatingx/skating-domain";
import { useEffect, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { logActionFailure } from "@/shared/utils/logActionFailure";

/**
 * What the analysis page's banner shows about one Race Day video record (ADR-010). Plain values
 * only: no Firebase types, nothing the banner could write back.
 */
export type RaceVideoContext = {
  readonly eventName: string;
  readonly eventPending: boolean;
  readonly raceLabel: string;
  readonly racePending: boolean;
  readonly videoLabel: string;
  readonly storedWhere: string | null;
  readonly externalUrl: string | null;
};

type Slot<T> =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly items: readonly T[] };

type Reads = {
  readonly key: string;
  readonly events: Slot<RaceEvent>;
  readonly races: Slot<RaceEntry>;
  readonly videos: Slot<RaceVideoRef>;
};

const LOADING = { status: "loading" } as const;

/**
 * Read-only. At most three listeners: the event list, the races of that event and its videos, all
 * released on unmount. The repository has no single-document reader, and these lists are small
 * (ADR-001 D6), so the three records are picked out in memory.
 *
 * Returns `null` for every case that is not "all three found": still loading, a read failed, or
 * any piece is missing. The banner then shows nothing and the page keeps working. A failed read is
 * logged with its code only.
 *
 * The caller has already passed the flag, PRO and id-format gates; this hook is only mounted after.
 */
export function useRaceVideoContext(link: RaceVideoLink): RaceVideoContext | null {
  const { uid } = useAuth();
  const key = uid ? `${uid}|${link.eventId}` : "";
  const [reads, setReads] = useState<Reads | null>(null);

  useEffect(() => {
    if (!uid) return undefined;
    const db = getFirestoreDb();
    if (!db) return undefined;

    const ctx = { db, userId: uid };
    const readKey = `${uid}|${link.eventId}`;
    const update = (patch: Partial<Pick<Reads, "events" | "races" | "videos">>) => {
      setReads((current) => {
        const base: Reads =
          current && current.key === readKey
            ? current
            : { key: readKey, events: LOADING, races: LOADING, videos: LOADING };
        return { ...base, ...patch };
      });
    };
    setReads({ key: readKey, events: LOADING, races: LOADING, videos: LOADING });

    const fail = (operation: string, error: { code: string }) => {
      // The code is enough to diagnose; a message can contain document paths.
      logActionFailure("analysis", operation, error);
    };

    const stops = [
      subscribeToRaceEvents(
        ctx,
        (list) => {
          update({ events: { status: "ready", items: list.items } });
        },
        (error) => {
          fail("read-race-video-event", error);
          update({ events: { status: "error" } });
        },
      ),
      subscribeToRaces(
        ctx,
        link.eventId,
        (list) => {
          update({ races: { status: "ready", items: list.items } });
        },
        (error) => {
          fail("read-race-video-race", error);
          update({ races: { status: "error" } });
        },
      ),
      subscribeToRaceVideos(
        ctx,
        link.eventId,
        (list) => {
          update({ videos: { status: "ready", items: list.items } });
        },
        (error) => {
          fail("read-race-video", error);
          update({ videos: { status: "error" } });
        },
      ),
    ];

    return () => {
      for (const stop of stops) stop();
    };
  }, [uid, link.eventId]);

  if (!reads || reads.key !== key) return null;
  if (reads.events.status !== "ready" || reads.races.status !== "ready" || reads.videos.status !== "ready") {
    return null;
  }

  const event = reads.events.items.find((item) => item.eventId === link.eventId);
  const video = reads.videos.items.find((item) => item.videoId === link.videoId);
  if (!event || !video) return null;
  const race = reads.races.items.find((item) => item.raceId === video.raceId);
  if (!race) return null;

  return {
    eventName: event.name,
    // Anything that is not exactly "verified" counts as pending: unknown must never look confirmed.
    eventPending: event.verification !== "verified",
    raceLabel: race.label,
    racePending: race.verification !== "verified",
    videoLabel: video.label,
    storedWhere: video.storedWhere,
    externalUrl: video.externalUrl,
  };
}
