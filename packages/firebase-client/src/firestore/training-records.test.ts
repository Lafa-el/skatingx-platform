import { paths } from "@skatingx/schema";
import type { TimeEntry } from "@skatingx/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A small in-memory Firestore that models what the manual-write race is about: a document has a
 * version, a plain read-then-write does not notice another writer landing in between, and a
 * transaction does (it reruns its callback against the newer document). `interleave` is that other
 * writer: it commits just before the next write of the function under test.
 */
const db = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, number>();
  const state = {
    interleave: null as (() => void) | null,
    attempts: 0,
    transactions: 0,
    plainWrites: 0,
  };
  const pathOf = (parts: unknown[]) => parts.filter((part) => typeof part === "string").join("/");
  const commit = (path: string, data: Record<string, unknown>, merge: boolean) => {
    const prev = merge ? store.get(path) : undefined;
    if (merge && !prev) throw new Error(`missing ${path}`);
    store.set(path, { ...prev, ...data });
    versions.set(path, (versions.get(path) ?? 0) + 1);
  };
  const fireInterleave = () => {
    const run = state.interleave;
    state.interleave = null;
    run?.();
  };
  const snapshotOf = (path: string) => {
    const data = store.get(path);
    return { exists: () => data !== undefined, data: () => data };
  };
  return {
    store,
    versions,
    state,
    commit,
    api: {
      doc: (...parts: unknown[]) => ({ kind: "doc" as const, path: pathOf(parts) }),
      collection: (...parts: unknown[]) => ({ kind: "collection" as const, path: pathOf(parts) }),
      serverTimestamp: () => "server-ts",
      getDoc: async (ref: { path: string }) => snapshotOf(ref.path),
      setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
        state.plainWrites += 1;
        fireInterleave();
        commit(ref.path, data, false);
      },
      updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
        state.plainWrites += 1;
        fireInterleave();
        commit(ref.path, data, true);
      },
      runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) => {
        state.transactions += 1;
        for (;;) {
          state.attempts += 1;
          const readVersions = new Map<string, number>();
          const writes: { path: string; data: Record<string, unknown>; merge: boolean }[] = [];
          const tx = {
            get: async (ref: { path: string }) => {
              readVersions.set(ref.path, versions.get(ref.path) ?? 0);
              return snapshotOf(ref.path);
            },
            set: (ref: { path: string }, data: Record<string, unknown>) => {
              writes.push({ path: ref.path, data, merge: false });
            },
            update: (ref: { path: string }, data: Record<string, unknown>) => {
              writes.push({ path: ref.path, data, merge: true });
            },
          };
          const result = await run(tx);
          fireInterleave();
          const stale = [...readVersions].some(([path, version]) => (versions.get(path) ?? 0) !== version);
          if (stale) continue; // Firestore reruns the callback against the newer document
          for (const write of writes) commit(write.path, write.data, write.merge);
          return result;
        }
      },
    },
  };
});

vi.mock("firebase/firestore", () => db.api);

import { addTimeEntry, deleteTimeEntry, updateTimeEntry } from "./training-records";

const userId = "user-1";
const athleteId = "lindsay";
const ctx = { db: {} as never, userId, athleteId };
const path500 = paths.trainingRecord(userId, athleteId, "500m");
const NOW = new Date("2026-10-30T12:00:00.000Z");
const NOW_ISO = NOW.toISOString();

const manual = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: "time_1",
  date: "2026-10-20",
  timeSeconds: 50.5,
  source: "manual",
  createdAt: "2026-10-20T08:00:00.000Z",
  ...over,
});

const raceEntry = (): TimeEntry => ({
  id: "race_buffalo-2026_500m-1",
  date: "2026-10-24",
  timeSeconds: 48.1,
  source: "race",
  note: "Buffalo · 500m",
  createdAt: "2026-10-24T20:00:00.000Z",
});

const seed = (entries: TimeEntry[]) => {
  db.commit(path500, { distanceId: "500m", label: "500m", unit: "seconds", entries, updatedAt: "seed-ts" }, false);
};
const stored = () => db.store.get(path500) as { entries: TimeEntry[]; updatedAt: unknown } | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  db.store.clear();
  db.versions.clear();
  db.state.interleave = null;
  db.state.attempts = 0;
  db.state.transactions = 0;
  db.state.plainWrites = 0;
});

describe("addTimeEntry", () => {
  it("appends a manual entry to the existing array and stamps the document", async () => {
    seed([manual()]);

    const entry = await addTimeEntry(ctx, "500m", "500m", { date: "2026-10-25", timeSeconds: 49.9, note: "  warm track  " });

    expect(entry).toEqual({
      id: expect.stringMatching(/^time_/),
      date: "2026-10-25",
      timeSeconds: 49.9,
      source: "manual",
      note: "warm track",
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
    expect(stored()?.entries).toEqual([manual(), entry]);
    expect(stored()?.updatedAt).toBe("server-ts");
  });

  it("creates the document, with the entry in it, when it does not exist yet", async () => {
    const entry = await addTimeEntry(ctx, "500m", "500m", { date: "2026-10-25", timeSeconds: 49.9, source: "training" });

    expect(stored()).toEqual({
      distanceId: "500m",
      label: "500m",
      unit: "seconds",
      entries: [entry],
      updatedAt: "server-ts",
    });
    expect(entry.source).toBe("training");
  });

  it("goes through a transaction, never a plain read-then-write", async () => {
    seed([]);
    await addTimeEntry(ctx, "500m", "500m", { date: "2026-10-25", timeSeconds: 49.9 });
    expect(db.state.transactions).toBe(1);
    expect(db.state.plainWrites).toBe(0);
  });
});

describe("updateTimeEntry", () => {
  it("changes one entry by id; the others and createdAt stay, updatedAt moves", async () => {
    const other = manual({ id: "time_2", date: "2026-10-21", timeSeconds: 51 });
    seed([manual(), other, raceEntry()]);

    await updateTimeEntry(ctx, "500m", "500m", "time_1", { date: "2026-10-22", timeSeconds: 49, note: "better" });

    expect(stored()?.entries).toEqual([
      {
        id: "time_1",
        date: "2026-10-22",
        timeSeconds: 49,
        source: "manual",
        note: "better",
        createdAt: "2026-10-20T08:00:00.000Z",
        updatedAt: NOW_ISO,
      },
      other,
      raceEntry(),
    ]);
    expect(stored()?.updatedAt).toBe("server-ts");
  });

  it("throws the same error, and writes nothing, when the document does not exist", async () => {
    await expect(
      updateTimeEntry(ctx, "500m", "500m", "time_1", { date: "2026-10-22", timeSeconds: 49 }),
    ).rejects.toThrow("Distance record document not found.");
    expect(db.store.size).toBe(0);
  });
});

describe("deleteTimeEntry", () => {
  it("removes one entry by id and leaves the rest", async () => {
    seed([manual(), manual({ id: "time_2" }), raceEntry()]);

    await deleteTimeEntry(ctx, "500m", "500m", "time_1");

    expect(stored()?.entries).toEqual([manual({ id: "time_2" }), raceEntry()]);
    expect(stored()?.updatedAt).toBe("server-ts");
  });

  it("is silent, and writes nothing, when the document does not exist", async () => {
    await expect(deleteTimeEntry(ctx, "500m", "500m", "time_1")).resolves.toBeUndefined();
    expect(db.store.size).toBe(0);
  });
});

describe("a manual edit that crosses a race-result sync commit keeps the synced entry", () => {
  // The sync commits its race_ entry after the manual write has read the document and before it writes.
  const syncCommitsRaceEntry = () => {
    db.state.interleave = () => {
      const current = stored()!;
      db.commit(path500, { entries: [...current.entries, raceEntry()], updatedAt: "sync-ts" }, true);
    };
  };

  it("add: the final array holds the new manual entry and the race_ entry", async () => {
    seed([manual()]);
    syncCommitsRaceEntry();

    const entry = await addTimeEntry(ctx, "500m", "500m", { date: "2026-10-25", timeSeconds: 49.9 });

    expect(db.state.attempts).toBe(2); // rerun against the document the sync had just changed
    expect(stored()?.entries).toEqual([manual(), raceEntry(), entry]);
  });

  it("update: the edit lands and the race_ entry survives", async () => {
    seed([manual()]);
    syncCommitsRaceEntry();

    await updateTimeEntry(ctx, "500m", "500m", "time_1", { date: "2026-10-22", timeSeconds: 49 });

    expect(db.state.attempts).toBe(2);
    expect(stored()?.entries.map((e) => e.id)).toEqual(["time_1", raceEntry().id]);
    expect(stored()?.entries[0]).toMatchObject({ date: "2026-10-22", timeSeconds: 49 });
    expect(stored()?.entries[1]).toEqual(raceEntry());
  });

  it("delete: the removal lands and the race_ entry survives", async () => {
    seed([manual(), manual({ id: "time_2" })]);
    syncCommitsRaceEntry();

    await deleteTimeEntry(ctx, "500m", "500m", "time_1");

    expect(db.state.attempts).toBe(2);
    expect(stored()?.entries).toEqual([manual({ id: "time_2" }), raceEntry()]);
  });

  it("add: a rerun regenerates the id against the newer array, and the returned entry is the one written", async () => {
    seed([manual()]);
    syncCommitsRaceEntry();

    const entry = await addTimeEntry(ctx, "500m", "500m", { date: "2026-10-25", timeSeconds: 49.9 });

    const written = stored()!.entries.filter((e) => e.id === entry.id);
    expect(written).toEqual([entry]);
    expect(new Set(stored()!.entries.map((e) => e.id)).size).toBe(3);
  });
});
