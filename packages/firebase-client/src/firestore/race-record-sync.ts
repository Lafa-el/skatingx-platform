import {
  DEFAULT_TRAINING_DISTANCES,
  type RaceEntry,
  type RaceEvent,
  type RaceResult,
  type RaceRosterEntry,
} from "@skatingx/schema";
import {
  planRaceRecords,
  reconcileRaceEntries,
  type DesiredRaceRecord,
  type RaceRecordPlan,
  type RaceRecordSources,
} from "@skatingx/skating-domain";
import { getDocs, runTransaction, serverTimestamp, type DocumentData, type Unsubscribe } from "firebase/firestore";

import {
  subscribeToRaceEvents,
  subscribeToRaceResults,
  subscribeToRaces,
  subscribeToRoster,
  type RaceDayContext,
  type RaceDayList,
  type RaceDayListError,
  type RaceDaySubscribeOptions,
} from "./race-day";
import { trainingRecordRef, trainingRecordsCollectionRef } from "./refs";
import type { RecordsActorContext } from "./training-records";
import { toFirestoreData } from "./sanitize";

/**
 * Race results -> training records (ADR-009). `reconcileRaceRecords` brings the `race_` entries
 * of the athlete's records documents in line with a plan; `startRaceRecordSync` keeps doing that
 * as Race Day data changes. Neither writes any Race Day document.
 */

export type RaceRecordSyncFailure = { distanceId: string; error: unknown };

export type RaceRecordSyncReport = {
  added: number;
  updated: number;
  removed: number;
  /** Documents whose `entries` was not an array: skipped, never overwritten. */
  unreadable: string[];
  failures: RaceRecordSyncFailure[];
};

type ReconcileOptions = {
  now?: Date;
  /** Checked before each document, so a stopped sync does not start another write. */
  isCancelled?: () => boolean;
};

function groupByDistance(desired: readonly DesiredRaceRecord[]): Map<string, DesiredRaceRecord[]> {
  const grouped = new Map<string, DesiredRaceRecord[]>();
  for (const record of desired) {
    grouped.set(record.recordDistanceId, [...(grouped.get(record.recordDistanceId) ?? []), record]);
  }
  return grouped;
}

/**
 * One cheap read finds which documents need a change; only those get a transaction, which
 * re-reads and recomputes so it never overwrites an entry the user added in between. A run that
 * changes nothing writes nothing, so reconciling twice is the same as reconciling once.
 */
export async function reconcileRaceRecords(
  ctx: RecordsActorContext,
  plan: RaceRecordPlan,
  options: ReconcileOptions = {},
): Promise<RaceRecordSyncReport> {
  const nowIso = (options.now ?? new Date()).toISOString();
  const report: RaceRecordSyncReport = { added: 0, updated: 0, removed: 0, unreadable: [], failures: [] };
  const desiredByDistance = groupByDistance(plan.desired);

  const snapshot = await getDocs(trainingRecordsCollectionRef(ctx.db, ctx.userId, ctx.athleteId));
  const stored = new Map<string, DocumentData>(snapshot.docs.map((docSnap) => [docSnap.id, docSnap.data()]));

  for (const distance of DEFAULT_TRAINING_DISTANCES) {
    if (options.isCancelled?.()) {
      break;
    }
    const distanceId = distance.distanceId;
    const desired = desiredByDistance.get(distanceId) ?? [];
    const current = stored.get(distanceId);
    const currentEntries: unknown = current?.entries ?? [];
    if (!Array.isArray(currentEntries)) {
      report.unreadable.push(distanceId);
      continue;
    }
    const preview = reconcileRaceEntries({
      existing: currentEntries,
      desired,
      canRemoveEntriesOf: plan.canRemoveEntriesOf,
      nowIso,
    });
    if (preview.added + preview.updated + preview.removed === 0) {
      continue;
    }

    const ref = trainingRecordRef(ctx.db, ctx.userId, ctx.athleteId, distanceId);
    try {
      const outcome = await runTransaction(ctx.db, async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data();
        const existing: unknown = data?.entries ?? [];
        if (!Array.isArray(existing)) {
          return "unreadable" as const;
        }
        const result = reconcileRaceEntries({
          existing,
          desired,
          canRemoveEntriesOf: plan.canRemoveEntriesOf,
          nowIso,
        });
        if (result.added + result.updated + result.removed === 0) {
          return result;
        }
        if (snap.exists()) {
          tx.update(ref, toFirestoreData({ entries: result.entries, updatedAt: serverTimestamp() }));
        } else {
          tx.set(
            ref,
            toFirestoreData({
              distanceId,
              label: distance.label,
              unit: "seconds",
              entries: result.entries,
              updatedAt: serverTimestamp(),
            }),
          );
        }
        return result;
      });
      if (outcome === "unreadable") {
        report.unreadable.push(distanceId);
        continue;
      }
      report.added += outcome.added;
      report.updated += outcome.updated;
      report.removed += outcome.removed;
    } catch (error) {
      // One failing document must not stop the others; the caller logs it and retries.
      report.failures.push({ distanceId, error });
    }
  }

  return report;
}

// --- keeping it in sync ---------------------------------------------------------------

type ListState<T> =
  | { status: "loading" }
  | { status: "ready"; list: RaceDayList<T> }
  | { status: "error" };

type EventData = {
  event: RaceEvent;
  roster: ListState<RaceRosterEntry>;
  races: ListState<RaceEntry>;
  results: ListState<RaceResult>;
  unsubscribe: () => void;
};

export type RaceRecordSyncHandlers = {
  /** Called after every run that reached Firestore, including runs that changed nothing. */
  onReport?: (report: RaceRecordSyncReport) => void;
  /** `operation` names what failed; log only the error's code or name, never document data. */
  onError?: (operation: string, error: unknown) => void;
};

export type RaceRecordSyncDeps = {
  subscribeEvents: typeof subscribeToRaceEvents;
  subscribeRoster: typeof subscribeToRoster;
  subscribeRaces: typeof subscribeToRaces;
  subscribeResults: typeof subscribeToRaceResults;
  reconcile: typeof reconcileRaceRecords;
  isOnline: () => boolean;
  /** Registers a "back online" callback and returns how to remove it. */
  onOnline: (callback: () => void) => () => void;
  debounceMs: number;
  retryMs: number;
};

const defaultDeps: RaceRecordSyncDeps = {
  subscribeEvents: subscribeToRaceEvents,
  subscribeRoster: subscribeToRoster,
  subscribeRaces: subscribeToRaces,
  subscribeResults: subscribeToRaceResults,
  reconcile: reconcileRaceRecords,
  isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
  onOnline: (callback) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }
    window.addEventListener("online", callback);
    return () => window.removeEventListener("online", callback);
  },
  // Lets the initial wave of snapshots (every event, three lists each) settle into one run.
  debounceMs: 500,
  retryMs: 30_000,
};

const WATCH: RaceDaySubscribeOptions = { includeMetadataChanges: true };

function isReady<T>(state: ListState<T>): state is { status: "ready"; list: RaceDayList<T> } {
  return state.status === "ready";
}

function itemsOf<T>(state: ListState<T>): T[] {
  return isReady(state) ? state.list.items : [];
}

function isComplete<T>(state: ListState<T>): boolean {
  // `fromCache` lists may lack documents that exist on the server, so they are never complete.
  return isReady(state) && state.list.invalid.length === 0 && state.list.fromCache !== true;
}

/**
 * Subscribes to every event's roster, races and results and reconciles the athlete's records
 * whenever any of them changes (also when the change is a local, still-queued write or the
 * cascade of a delete). Returns a function that releases every listener and timer.
 *
 * A run only removes entries it can prove are orphaned (ADR-009 2.7): see `canRemoveEntriesOf`.
 */
export function startRaceRecordSync(
  ctx: RaceDayContext & { athleteId: string },
  handlers: RaceRecordSyncHandlers = {},
  overrides: Partial<RaceRecordSyncDeps> = {},
): () => void {
  const deps = { ...defaultDeps, ...overrides };
  const events = new Map<string, EventData>();
  let eventsState: ListState<RaceEvent> = { status: "loading" };
  let stopped = false;
  let running = false;
  let rerun = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let waitingForOnline = false;

  const recordsCtx: RecordsActorContext = { db: ctx.db, userId: ctx.userId, athleteId: ctx.athleteId };

  function collect(): RaceRecordSources {
    return {
      eventsComplete: isComplete(eventsState),
      unknownEventIds: isReady(eventsState) ? eventsState.list.invalid.map((entry) => entry.id) : [],
      events: [...events.values()].map((data) => ({
        event: data.event,
        roster: itemsOf(data.roster),
        races: itemsOf(data.races),
        results: itemsOf(data.results),
        complete: isComplete(data.roster) && isComplete(data.races) && isComplete(data.results),
      })),
    };
  }

  async function run(): Promise<void> {
    if (stopped || !isReady(eventsState)) {
      return;
    }
    if (running) {
      rerun = true;
      return;
    }
    if (!deps.isOnline()) {
      // Transactions do not queue offline. Reconcile once the connection is back.
      waitingForOnline = true;
      return;
    }
    running = true;
    try {
      do {
        rerun = false;
        const plan = planRaceRecords({ sources: collect(), athleteId: ctx.athleteId });
        try {
          const report = await deps.reconcile(recordsCtx, plan, { isCancelled: () => stopped });
          for (const failure of report.failures) {
            handlers.onError?.(`reconcile:${failure.distanceId}`, failure.error);
          }
          if (report.unreadable.length > 0) {
            handlers.onError?.("reconcile:unreadable", new Error(report.unreadable.join(",")));
          }
          if (!stopped) {
            handlers.onReport?.(report);
            if (report.failures.length > 0) {
              scheduleRetry();
            }
          }
        } catch (error) {
          handlers.onError?.("reconcile", error);
          scheduleRetry();
        }
      } while (rerun && !stopped);
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    if (stopped) {
      return;
    }
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, deps.debounceMs);
  }

  function scheduleRetry(): void {
    if (stopped || retryTimer !== null) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      schedule();
    }, deps.retryMs);
  }

  const stopListeningOnline = deps.onOnline(() => {
    if (waitingForOnline) {
      waitingForOnline = false;
      schedule();
    }
  });

  function subscribeEvent(data: EventData, eventId: string): void {
    const update = <K extends "roster" | "races" | "results">(key: K, state: EventData[K]) => {
      if (events.get(eventId) === data) {
        data[key] = state;
        schedule();
      }
    };
    const fail = (key: "roster" | "races" | "results") => (error: RaceDayListError) => {
      handlers.onError?.(`subscribe:${key}`, error);
      update(key, { status: "error" });
    };
    const stops: Unsubscribe[] = [
      deps.subscribeRoster(ctx, eventId, (list) => update("roster", { status: "ready", list }), fail("roster"), WATCH),
      deps.subscribeRaces(ctx, eventId, (list) => update("races", { status: "ready", list }), fail("races"), WATCH),
      deps.subscribeResults(
        ctx,
        eventId,
        (list) => update("results", { status: "ready", list }),
        fail("results"),
        WATCH,
      ),
    ];
    data.unsubscribe = () => stops.forEach((stop) => stop());
  }

  const stopEvents = deps.subscribeEvents(
    ctx,
    (list) => {
      eventsState = { status: "ready", list };
      const liveIds = new Set(list.items.map((event) => event.eventId));
      for (const [eventId, data] of events) {
        if (!liveIds.has(eventId)) {
          data.unsubscribe();
          events.delete(eventId);
        }
      }
      for (const event of list.items) {
        const existing = events.get(event.eventId);
        if (existing) {
          existing.event = event;
          continue;
        }
        const data: EventData = {
          event,
          roster: { status: "loading" },
          races: { status: "loading" },
          results: { status: "loading" },
          unsubscribe: () => undefined,
        };
        events.set(event.eventId, data);
        subscribeEvent(data, event.eventId);
      }
      schedule();
    },
    (error) => {
      eventsState = { status: "error" };
      handlers.onError?.("subscribe:events", error);
    },
    WATCH,
  );

  return () => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
    }
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
    }
    stopListeningOnline();
    stopEvents();
    for (const data of events.values()) {
      data.unsubscribe();
    }
    events.clear();
  };
}
