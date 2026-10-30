import { paths } from "@skatingx/schema";
import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import type { DesiredRaceRecord, RaceRecordPlan } from "@skatingx/skating-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const writes = vi.hoisted(() => ({ count: 0, failPath: null as string | null }));

const firestore = vi.hoisted(() => {
  const pathOf = (parts: unknown[]) => parts.filter((part) => typeof part === "string").join("/");
  const tx = {
    get: async (target: { path?: string }) => {
      const data = store.get(target.path ?? "");
      return { exists: () => data !== undefined, data: () => data };
    },
    set: (ref: { path: string }, data: Record<string, unknown>) => {
      writes.count += 1;
      store.set(ref.path, { ...data });
    },
    update: (ref: { path: string }, data: Record<string, unknown>) => {
      writes.count += 1;
      const prev = store.get(ref.path);
      if (!prev) throw new Error(`missing ${ref.path}`);
      store.set(ref.path, { ...prev, ...data });
    },
  };
  return {
    collection: (...parts: unknown[]) => ({ kind: "collection" as const, path: pathOf(parts) }),
    doc: (...parts: unknown[]) => ({ kind: "doc" as const, path: pathOf(parts) }),
    getDocs: async (target: { path: string }) => {
      const prefix = `${target.path}/`;
      const found = [...store.entries()].filter(([path]) => path.startsWith(prefix));
      return { docs: found.map(([path, data]) => ({ id: path.split("/").at(-1), data: () => data })) };
    },
    serverTimestamp: () => "ts",
    runTransaction: async (_db: unknown, run: (transaction: typeof tx) => Promise<unknown>) => {
      const failPath = writes.failPath;
      if (!failPath) {
        return run(tx);
      }
      // Fails only the document being written, like a contended or offline transaction.
      const guard = (write: (ref: { path: string }, data: Record<string, unknown>) => void) =>
        (ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path === failPath) throw new Error("tx failed");
          write(ref, data);
        };
      return run({ ...tx, set: guard(tx.set), update: guard(tx.update) });
    },
  };
});

vi.mock("firebase/firestore", () => firestore);

import { reconcileRaceRecords, startRaceRecordSync, type RaceRecordSyncReport } from "./race-record-sync";

const userId = "user-1";
const athleteId = "lindsay";
const ctx = { db: {} as never, userId, athleteId };
const doc500 = paths.trainingRecord(userId, athleteId, "500m");
const doc1500 = paths.trainingRecord(userId, athleteId, "1500m");
const NOW = new Date("2026-10-30T12:00:00.000Z");
const entryId = "race_buffalo-championships-2026_500m-1";

const desired = (over: Partial<DesiredRaceRecord> = {}): DesiredRaceRecord => ({
  entryId,
  eventId: "buffalo-championships-2026",
  raceId: "500m-1",
  recordDistanceId: "500m",
  date: "2026-10-24",
  timeSeconds: 48.123,
  note: "Buffalo · 500m",
  ...over,
});

const planOf = (records: DesiredRaceRecord[], canRemove = true): RaceRecordPlan => ({
  desired: records,
  skipped: [],
  canRemoveEntriesOf: () => canRemove,
});

const manual = { id: "time_1_a", date: "2026-09-01", timeSeconds: 51.2, source: "manual", createdAt: "x" };
const entriesAt = (path: string) => (store.get(path)?.entries ?? []) as Record<string, unknown>[];

beforeEach(() => {
  store.clear();
  writes.count = 0;
  writes.failPath = null;
});

describe("reconcileRaceRecords", () => {
  it("creates the distance document when it does not exist yet", async () => {
    const report = await reconcileRaceRecords(ctx, planOf([desired()]), { now: NOW });
    expect(report).toMatchObject({ added: 1, updated: 0, removed: 0, unreadable: [], failures: [] });
    expect(store.get(doc500)).toMatchObject({ distanceId: "500m", label: "500m", unit: "seconds" });
    expect(entriesAt(doc500)).toEqual([
      {
        id: entryId,
        date: "2026-10-24",
        timeSeconds: 48.123,
        note: "Buffalo · 500m",
        source: "race",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]);
  });

  it("adds next to the user's entries and leaves them as they were", async () => {
    store.set(doc500, { distanceId: "500m", label: "500m", unit: "seconds", entries: [manual] });
    await reconcileRaceRecords(ctx, planOf([desired()]), { now: NOW });
    const entries = entriesAt(doc500);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(manual);
  });

  it("is idempotent: the same plan again writes nothing", async () => {
    await reconcileRaceRecords(ctx, planOf([desired()]), { now: NOW });
    const written = writes.count;
    const again = await reconcileRaceRecords(ctx, planOf([desired()]), { now: NOW });
    expect(again).toMatchObject({ added: 0, updated: 0, removed: 0 });
    expect(writes.count).toBe(written);
    expect(entriesAt(doc500)).toHaveLength(1);
  });

  it("updates an edited value in place, and removes the entry when the plan no longer has it", async () => {
    await reconcileRaceRecords(ctx, planOf([desired()]), { now: NOW });
    const updated = await reconcileRaceRecords(ctx, planOf([desired({ timeSeconds: 47.5 })]), { now: NOW });
    expect(updated.updated).toBe(1);
    expect(entriesAt(doc500)).toHaveLength(1);
    expect(entriesAt(doc500)[0]).toMatchObject({ timeSeconds: 47.5 });

    const removed = await reconcileRaceRecords(ctx, planOf([]), { now: NOW });
    expect(removed.removed).toBe(1);
    expect(entriesAt(doc500)).toEqual([]);
  });

  it("keeps the entry when the plan says removal is not safe", async () => {
    await reconcileRaceRecords(ctx, planOf([desired()]), { now: NOW });
    const report = await reconcileRaceRecords(ctx, planOf([], false), { now: NOW });
    expect(report.removed).toBe(0);
    expect(entriesAt(doc500)).toHaveLength(1);
  });

  it("moves nothing between distances: Super 1500m lands in the 1500m document", async () => {
    await reconcileRaceRecords(
      ctx,
      planOf([
        desired({
          entryId: "race_buffalo-championships-2026_super-1500m",
          raceId: "super-1500m",
          recordDistanceId: "1500m",
          timeSeconds: 150.5,
          note: "Buffalo · Super 1500m",
        }),
      ]),
      { now: NOW },
    );
    expect(entriesAt(doc1500)).toHaveLength(1);
    expect(entriesAt(doc1500)[0]).toMatchObject({ note: "Buffalo · Super 1500m", source: "race" });
    expect(store.get(paths.trainingRecord(userId, athleteId, "super_1500m"))).toBeUndefined();
  });

  it("skips a document whose entries is not an array, and never overwrites it", async () => {
    store.set(doc500, { distanceId: "500m", entries: "broken" });
    const report = await reconcileRaceRecords(ctx, planOf([desired()]), { now: NOW });
    expect(report.unreadable).toEqual(["500m"]);
    expect(store.get(doc500)).toEqual({ distanceId: "500m", entries: "broken" });
    expect(writes.count).toBe(0);
  });

  it("records a failing document and still reconciles the others", async () => {
    writes.failPath = doc500;
    const report = await reconcileRaceRecords(
      ctx,
      planOf([
        desired(),
        desired({ entryId: "race_buffalo-championships-2026_1500m-1", raceId: "1500m-1", recordDistanceId: "1500m" }),
      ]),
      { now: NOW },
    );
    expect(report.failures.map((f) => f.distanceId)).toEqual(["500m"]);
    expect(report.added).toBe(1);
    expect(entriesAt(doc1500)).toHaveLength(1);
    expect(store.get(doc500)).toBeUndefined();
  });

  it("stops before the next document once cancelled", async () => {
    const report = await reconcileRaceRecords(ctx, planOf([desired()]), { now: NOW, isCancelled: () => true });
    expect(report.added).toBe(0);
    expect(writes.count).toBe(0);
  });
});

// --- startRaceRecordSync: the data -> reconcile loop ----------------------------------------

const prov = { verification: "verified", source: "manual", sourceNote: "", verifiedAt: null, schemaVersion: 1 } as const;
const event = (eventId: string, name = "Buffalo"): RaceEvent => ({
  ...prov,
  eventId,
  name,
  dates: ["2026-10-24"],
  timeZone: null,
  venue: null,
});
const me: RaceRosterEntry = {
  ...prov,
  rosterId: "lindsay",
  displayName: "Lindsay",
  bib: "",
  division: "",
  isSelf: true,
  isFollowed: false,
  athleteRefId: "lindsay",
};
const race500: RaceEntry = {
  ...prov,
  raceId: "500m-1",
  distanceId: "500m",
  label: "500m",
  sortOrder: 0,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: [],
};
const result500: RaceResult = {
  ...prov,
  resultId: "500m-1_lindsay",
  raceId: "500m-1",
  rosterId: "lindsay",
  status: "finished",
  timeSeconds: 48.123,
  place: 1,
  advanced: null,
};

type Listener<T> = { onData: (list: { items: T[]; invalid: { id: string; reason: string }[]; fromCache?: boolean }) => void; onError: (e: { code: string; message: string }) => void; stop: ReturnType<typeof vi.fn> };

function harness(over: { online?: boolean } = {}) {
  const events: Listener<RaceEvent>[] = [];
  const roster = new Map<string, Listener<RaceRosterEntry>>();
  const races = new Map<string, Listener<RaceEntry>>();
  const results = new Map<string, Listener<RaceResult>>();
  const onlineCallbacks: (() => void)[] = [];
  let online = over.online ?? true;
  const plans: RaceRecordPlan[] = [];
  const reconcile = vi.fn(async (_ctx: unknown, plan: RaceRecordPlan): Promise<RaceRecordSyncReport> => {
    plans.push(plan);
    return { added: 0, updated: 0, removed: 0, unreadable: [], failures: [] };
  });
  const onError = vi.fn();
  const track = <T,>(into: Map<string, Listener<T>>) =>
    (_c: unknown, eventId: string, onData: Listener<T>["onData"], onErr: Listener<T>["onError"]) => {
      const stop = vi.fn();
      into.set(eventId, { onData, onError: onErr, stop });
      return stop;
    };
  const stop = startRaceRecordSync(
    { ...ctx, athleteId },
    { onError },
    {
      subscribeEvents: ((_c: unknown, onData: Listener<RaceEvent>["onData"], onErr: Listener<RaceEvent>["onError"]) => {
        const s = vi.fn();
        events.push({ onData, onError: onErr, stop: s });
        return s;
      }) as never,
      subscribeRoster: track(roster) as never,
      subscribeRaces: track(races) as never,
      subscribeResults: track(results) as never,
      reconcile: reconcile as never,
      isOnline: () => online,
      onOnline: (cb) => {
        onlineCallbacks.push(cb);
        return () => undefined;
      },
      debounceMs: 100,
      retryMs: 1000,
    },
  );
  const ok = <T,>(items: T[], extra: { fromCache?: boolean; invalid?: { id: string; reason: string }[] } = {}) => ({
    items,
    invalid: extra.invalid ?? [],
    ...(extra.fromCache === undefined ? {} : { fromCache: extra.fromCache }),
  });
  const deliverAll = (eventId: string, extra: { fromCache?: boolean } = {}) => {
    roster.get(eventId)!.onData(ok([me], extra));
    races.get(eventId)!.onData(ok([race500], extra));
    results.get(eventId)!.onData(ok([result500], extra));
  };
  return {
    events, roster, races, results, reconcile, onError, plans, stop, ok, deliverAll,
    setOnline: (value: boolean) => { online = value; },
    goOnline: () => onlineCallbacks.forEach((cb) => cb()),
  };
}

describe("startRaceRecordSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does nothing until the event list is read, then reconciles once the data settled", async () => {
    const h = harness();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.reconcile).not.toHaveBeenCalled();

    h.events[0]!.onData(h.ok([event("buffalo-championships-2026")]));
    h.deliverAll("buffalo-championships-2026");
    await vi.advanceTimersByTimeAsync(99);
    expect(h.reconcile).not.toHaveBeenCalled(); // debounced: one run for the whole initial wave
    await vi.advanceTimersByTimeAsync(10);
    expect(h.reconcile).toHaveBeenCalledTimes(1);

    const plan = h.plans[0]!;
    expect(plan.desired).toHaveLength(1);
    expect(plan.desired[0]).toMatchObject({ entryId, recordDistanceId: "500m" });
    expect(plan.canRemoveEntriesOf("buffalo-championships-2026")).toBe(true);
    h.stop();
  });

  it("reconciles again whenever the data changes: result confirmed, edited back to pending", async () => {
    const h = harness();
    const id = "buffalo-championships-2026";
    h.events[0]!.onData(h.ok([event(id)]));
    h.roster.get(id)!.onData(h.ok([me]));
    h.races.get(id)!.onData(h.ok([race500]));
    h.results.get(id)!.onData(h.ok([{ ...result500, verification: "pending" as const }]));
    await vi.advanceTimersByTimeAsync(200);
    expect(h.plans.at(-1)!.desired).toHaveLength(0);

    h.results.get(id)!.onData(h.ok([result500]));
    await vi.advanceTimersByTimeAsync(200);
    expect(h.plans.at(-1)!.desired).toHaveLength(1);

    h.results.get(id)!.onData(h.ok([{ ...result500, verification: "pending" as const }]));
    await vi.advanceTimersByTimeAsync(200);
    expect(h.plans.at(-1)!.desired).toHaveLength(0);
    expect(h.plans.at(-1)!.canRemoveEntriesOf(id)).toBe(true); // so the entry goes
    h.stop();
  });

  it("never allows removal on lists that came only from the cache", async () => {
    const h = harness();
    const id = "buffalo-championships-2026";
    h.events[0]!.onData(h.ok([event(id)]));
    h.deliverAll(id, { fromCache: true });
    await vi.advanceTimersByTimeAsync(200);
    expect(h.plans[0]!.canRemoveEntriesOf(id)).toBe(false);

    h.deliverAll(id, { fromCache: false }); // the server answered
    await vi.advanceTimersByTimeAsync(200);
    expect(h.plans.at(-1)!.canRemoveEntriesOf(id)).toBe(true);
    h.stop();
  });

  it("never allows removal while a list is unreadable, errored or still loading", async () => {
    const h = harness();
    const id = "buffalo-championships-2026";
    h.events[0]!.onData(h.ok([event(id)]));
    h.roster.get(id)!.onData(h.ok([me]));
    h.races.get(id)!.onData(h.ok([race500]));
    h.results.get(id)!.onData(h.ok([result500], { invalid: [{ id: "x_y", reason: "bad" }] }));
    await vi.advanceTimersByTimeAsync(200);
    expect(h.plans.at(-1)!.canRemoveEntriesOf(id)).toBe(false);

    h.results.get(id)!.onError({ code: "permission-denied", message: "no" });
    await vi.advanceTimersByTimeAsync(200);
    expect(h.plans.at(-1)!.canRemoveEntriesOf(id)).toBe(false);
    expect(h.onError).toHaveBeenCalledWith("subscribe:results", expect.anything());
    h.stop();
  });

  it("a deleted event stops its listeners and its entries become removable", async () => {
    const h = harness();
    const id = "buffalo-championships-2026";
    h.events[0]!.onData(h.ok([event(id)]));
    h.deliverAll(id);
    await vi.advanceTimersByTimeAsync(200);
    const listeners = [h.roster.get(id)!, h.races.get(id)!, h.results.get(id)!];

    h.events[0]!.onData(h.ok([]));
    await vi.advanceTimersByTimeAsync(200);
    for (const l of listeners) expect(l.stop).toHaveBeenCalledTimes(1);
    const plan = h.plans.at(-1)!;
    expect(plan.desired).toEqual([]);
    expect(plan.canRemoveEntriesOf(id)).toBe(true);
    h.stop();
  });

  it("an unreadable event document keeps its entries and a failed event list removes nothing", async () => {
    const h = harness();
    h.events[0]!.onData(h.ok([], { invalid: [{ id: "buffalo-championships-2026", reason: "bad" }] }));
    await vi.advanceTimersByTimeAsync(200);
    expect(h.plans.at(-1)!.canRemoveEntriesOf("buffalo-championships-2026")).toBe(false);
    expect(h.plans.at(-1)!.canRemoveEntriesOf("other")).toBe(false); // list not complete

    const h2 = harness();
    h2.events[0]!.onError({ code: "unavailable", message: "x" });
    await vi.advanceTimersByTimeAsync(500);
    expect(h2.reconcile).not.toHaveBeenCalled();
    h.stop();
    h2.stop();
  });

  it("waits while offline and reconciles when the connection is back", async () => {
    const h = harness({ online: false });
    const id = "buffalo-championships-2026";
    h.events[0]!.onData(h.ok([event(id)]));
    h.deliverAll(id);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.reconcile).not.toHaveBeenCalled();

    h.setOnline(true);
    h.goOnline();
    await vi.advanceTimersByTimeAsync(200);
    expect(h.reconcile).toHaveBeenCalledTimes(1);
    h.stop();
  });

  it("a change during a run is picked up by one more run, never two at once", async () => {
    const h = harness();
    const id = "buffalo-championships-2026";
    let release: () => void = () => undefined;
    let active = 0;
    let overlap = false;
    h.reconcile.mockImplementation(async (_c, plan) => {
      h.plans.push(plan);
      active += 1;
      overlap ||= active > 1;
      await new Promise<void>((resolve) => { release = resolve; });
      active -= 1;
      return { added: 0, updated: 0, removed: 0, unreadable: [], failures: [] };
    });
    h.events[0]!.onData(h.ok([event(id)]));
    h.deliverAll(id);
    await vi.advanceTimersByTimeAsync(200);
    expect(h.reconcile).toHaveBeenCalledTimes(1);

    h.results.get(id)!.onData(h.ok([]));
    await vi.advanceTimersByTimeAsync(200);
    expect(h.reconcile).toHaveBeenCalledTimes(1); // still the first, not started twice
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(h.reconcile).toHaveBeenCalledTimes(2);
    expect(h.plans.at(-1)!.desired).toEqual([]);
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(overlap).toBe(false);
    h.stop();
  });

  it("reports a failed run, keeps the app going and retries later", async () => {
    const h = harness();
    const id = "buffalo-championships-2026";
    h.reconcile.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "unavailable" }));
    h.events[0]!.onData(h.ok([event(id)]));
    h.deliverAll(id);
    await vi.advanceTimersByTimeAsync(200);
    expect(h.onError).toHaveBeenCalledWith("reconcile", expect.objectContaining({ code: "unavailable" }));
    expect(h.reconcile).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1200);
    expect(h.reconcile).toHaveBeenCalledTimes(2);
    h.stop();
  });

  it("stopping releases every listener and cancels pending runs", async () => {
    const h = harness();
    const id = "buffalo-championships-2026";
    h.events[0]!.onData(h.ok([event(id)]));
    h.deliverAll(id);
    h.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.reconcile).not.toHaveBeenCalled();
    expect(h.events[0]!.stop).toHaveBeenCalledTimes(1);
    for (const l of [h.roster.get(id)!, h.races.get(id)!, h.results.get(id)!]) {
      expect(l.stop).toHaveBeenCalledTimes(1);
    }
  });
});
