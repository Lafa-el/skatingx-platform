import { paths } from "@skatingx/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DELETE = { kind: "delete-field" };
const TIMESTAMP = { kind: "server-timestamp" };

type Doc = Record<string, unknown>;

const memory = vi.hoisted(() => ({
  docs: new Map<string, Doc>(),
  commits: [] as number[],
  failCommits: 0,
}));

function refOf(path: string) {
  return { path, id: path.split("/").pop() ?? path };
}

const firestore = vi.hoisted(() => {
  function join(parts: unknown[]): string {
    return parts.filter((part) => typeof part === "string").join("/");
  }
  return {
    collection: vi.fn((...parts: unknown[]) => ({ kind: "collection" as const, path: join(parts) })),
    collectionGroup: vi.fn((_db: unknown, name: string) => ({ kind: "group" as const, name })),
    doc: vi.fn((...parts: unknown[]) => refOf(join(parts))),
    getDoc: vi.fn(async (ref: { path: string; id: string }) => {
      const data = memory.docs.get(ref.path);
      return {
        exists: () => data !== undefined,
        data: () => data,
        get: (field: string) => data?.[field],
        id: ref.id,
        ref,
      };
    }),
    getDocs: vi.fn(async (source: { kind?: string; path?: string; name?: string; source?: unknown; constraints?: Array<{ kind: string; field?: string; value?: unknown; n?: number }> }) => {
      const flat = flatten(source);
      const limitHit = flat.constraints.find((item) => item.kind === "limit") as { n: number } | undefined;
      const wheres = flat.constraints.filter((item) => item.kind === "where") as Array<{
        field: string;
        value: unknown;
      }>;
      let paths = matching(flat.base);
      for (const clause of wheres) {
        paths = paths.filter((path) => memory.docs.get(path)?.[clause.field] === clause.value);
      }
      if (limitHit) {
        paths = paths.slice(0, limitHit.n);
      }
      return {
        empty: paths.length === 0,
        size: paths.length,
        docs: paths.map((path) => ({
          id: path.split("/").pop(),
          ref: refOf(path),
          data: () => memory.docs.get(path),
          get: (field: string) => memory.docs.get(path)?.[field],
        })),
      };
    }),
    query: vi.fn((source: unknown, ...constraints: unknown[]) => ({ source, constraints })),
    where: vi.fn((field: string, _op: string, value: unknown) => ({ kind: "where" as const, field, value })),
    limit: vi.fn((n: number) => ({ kind: "limit" as const, n })),
    writeBatch: vi.fn(() => {
      const doomed: string[] = [];
      return {
        delete(ref: { path: string }) {
          doomed.push(ref.path);
        },
        async commit() {
          if (memory.failCommits > 0) {
            memory.failCommits -= 1;
            throw new Error("batch-failed");
          }
          memory.commits.push(doomed.length);
          for (const path of doomed) {
            memory.docs.delete(path);
          }
        },
      };
    }),
    deleteDoc: vi.fn(async (ref: { path: string }) => {
      memory.docs.delete(ref.path);
    }),
    updateDoc: vi.fn(async (ref: { path: string }, data: Doc) => {
      const current = memory.docs.get(ref.path);
      if (!current) {
        throw new Error("missing-settings");
      }
      for (const [key, value] of Object.entries(data)) {
        if (value === DELETE) {
          delete current[key];
        } else {
          current[key] = value;
        }
      }
    }),
    deleteField: vi.fn(() => DELETE),
    serverTimestamp: vi.fn(() => TIMESTAMP),
  };

  type Constraint = { kind: string; field?: string; value?: unknown; n?: number };
  type Base = { kind?: string; path?: string; name?: string; source?: unknown; constraints?: Constraint[] };

  function flatten(source: Base): { base: Base; constraints: Constraint[] } {
    if (source.constraints) {
      const inner = flatten(source.source as Base);
      return { base: inner.base, constraints: [...inner.constraints, ...source.constraints] };
    }
    return { base: source, constraints: [] };
  }

  function matching(base: Base): string[] {
    const paths = [...memory.docs.keys()];
    if (base.kind === "collection" && base.path) {
      const prefix = `${base.path}/`;
      return paths.filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"));
    }
    if (base.kind === "group" && base.name) {
      return paths.filter((path) => {
        const parts = path.split("/");
        return parts.some((part, index) => index % 2 === 0 && part === base.name && index === parts.length - 2);
      });
    }
    return [];
  }
});

vi.mock("firebase/firestore", () => firestore);

import { deleteAthlete } from "./delete-athlete";

const userId = "user-1";

function put(path: string, data: Doc = {}) {
  memory.docs.set(path, { ...data });
}

beforeEach(() => {
  memory.docs.clear();
  memory.commits.length = 0;
  memory.failCommits = 0;
  firestore.updateDoc.mockClear();
  firestore.deleteDoc.mockClear();
});

function seedShared() {
  put(paths.journalDay(userId, "2026-11-01"), { note: "kept" });
  put(paths.userSettings(userId), { activeAthleteId: "lindsay", parentPinHash: "hash" });
  put(paths.raceDayEvent(userId, "meet"), { name: "Meet" });
  put(paths.raceDaySummary(userId, "meet"), { text: "snapshot" });
  put(paths.raceDayRoster(userId, "meet", "row-other"), { athleteRefId: "other" });
  put(paths.raceDayResult(userId, "meet", "res-other"), { rosterId: "row-other" });
  put(paths.raceDayVideo(userId, "meet", "vid-other"), { rosterId: "row-other" });
  put(paths.analysisRecord(userId, "analysis-other"), { athleteId: "alex" });
}

function seedAthlete(athleteId: string, displayName: string) {
  const root = paths.athleteProfile(userId, athleteId).replace(/\/profile\/main$/, "");
  put(paths.athleteProfile(userId, athleteId), { displayName, userId });
  put(paths.athleteGamification(userId, athleteId), { points: 3 });
  put(paths.trainingState(userId, athleteId), { todayTasks: [] });
  put(paths.trainingRewardsCatalog(userId, athleteId), { items: [] });
  put(`${paths.pointsLedgerCollection(userId, athleteId)}/p1`, { points: 1 });
  put(`${paths.taskHistoryCollection(userId, athleteId)}/2026-11-01`, { tasks: [] });
  put(`${paths.trainingRecordsCollection(userId, athleteId)}/500m`, { best: 40 });
  put(`${paths.trainingRedemptionsCollection(userId, athleteId)}/red1`, { item: "x" });
  put(`${paths.equipmentHistoryCollection(userId, athleteId)}/eq1`, { note: "blade" });
  put(`${root}/training/races/race1`, { name: "old" });
  put(`${root}/equipment/records/legacy1`, { note: "legacy" });
  put(`${root}/analysis/sessions/session1`, { note: "session" });
  put(paths.analysisRecord(userId, `analysis-${athleteId}`), { athleteId });
  put(paths.raceDayRoster(userId, "meet", `row-${athleteId}`), { athleteRefId: athleteId });
  put(paths.raceDayResult(userId, "meet", `res-${athleteId}`), { rosterId: `row-${athleteId}` });
  put(paths.raceDayVideo(userId, "meet", `vid-${athleteId}`), { rosterId: `row-${athleteId}` });
}

describe("deleteAthlete", () => {
  it("deletes that athlete's data and leaves the journal, the event, and everyone else", async () => {
    seedShared();
    seedAthlete("lindsay", "Lindsay");
    put(paths.athleteProfile(userId, "alex"), { displayName: "Alex", userId });
    await deleteAthlete({} as never, userId, "lindsay");

    expect(memory.docs.has(paths.athleteProfile(userId, "lindsay"))).toBe(false);
    expect(memory.docs.has(paths.athleteGamification(userId, "lindsay"))).toBe(false);
    expect(memory.docs.has(paths.trainingState(userId, "lindsay"))).toBe(false);
    expect(memory.docs.has(paths.trainingRewardsCatalog(userId, "lindsay"))).toBe(false);
    expect(memory.docs.has(`${paths.pointsLedgerCollection(userId, "lindsay")}/p1`)).toBe(false);
    expect(memory.docs.has(`${paths.taskHistoryCollection(userId, "lindsay")}/2026-11-01`)).toBe(false);
    expect(memory.docs.has(`${paths.trainingRecordsCollection(userId, "lindsay")}/500m`)).toBe(false);
    expect(memory.docs.has(`${paths.trainingRedemptionsCollection(userId, "lindsay")}/red1`)).toBe(false);
    expect(memory.docs.has(`${paths.equipmentHistoryCollection(userId, "lindsay")}/eq1`)).toBe(false);
    const root = paths.athleteProfile(userId, "lindsay").replace(/\/profile\/main$/, "");
    expect(memory.docs.has(`${root}/training/races/race1`)).toBe(false);
    expect(memory.docs.has(`${root}/equipment/records/legacy1`)).toBe(false);
    expect(memory.docs.has(`${root}/analysis/sessions/session1`)).toBe(false);
    expect(memory.docs.has(paths.analysisRecord(userId, "analysis-lindsay"))).toBe(false);
    expect(memory.docs.has(paths.raceDayRoster(userId, "meet", "row-lindsay"))).toBe(false);
    expect(memory.docs.has(paths.raceDayResult(userId, "meet", "res-lindsay"))).toBe(false);
    expect(memory.docs.has(paths.raceDayVideo(userId, "meet", "vid-lindsay"))).toBe(false);

    expect(memory.docs.has(paths.journalDay(userId, "2026-11-01"))).toBe(true);
    expect(memory.docs.get(paths.userSettings(userId))?.parentPinHash).toBe("hash");
    expect(memory.docs.has(paths.raceDayEvent(userId, "meet"))).toBe(true);
    expect(memory.docs.has(paths.raceDaySummary(userId, "meet"))).toBe(true);
    expect(memory.docs.has(paths.raceDayRoster(userId, "meet", "row-other"))).toBe(true);
    expect(memory.docs.has(paths.raceDayResult(userId, "meet", "res-other"))).toBe(true);
    expect(memory.docs.has(paths.raceDayVideo(userId, "meet", "vid-other"))).toBe(true);
    expect(memory.docs.has(paths.athleteProfile(userId, "alex"))).toBe(true);
    expect(memory.docs.has(paths.analysisRecord(userId, "analysis-other"))).toBe(true);
  });

  it("leaves the active athlete alone when someone else is deleted", async () => {
    seedShared();
    seedAthlete("lindsay", "Lindsay");
    seedAthlete("alex", "Alex");
    await deleteAthlete({} as never, userId, "alex");
    expect(memory.docs.get(paths.userSettings(userId))?.activeAthleteId).toBe("lindsay");
    expect(memory.docs.has(paths.athleteProfile(userId, "lindsay"))).toBe(true);
    expect(memory.docs.has(paths.athleteProfile(userId, "alex"))).toBe(false);
    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });

  it("switches to the first remaining athlete by the selector order", async () => {
    seedShared();
    seedAthlete("lindsay", "Lindsay");
    seedAthlete("alex", "Alex");
    put(paths.athleteProfile(userId, "zoe"), { displayName: "Zoe", userId });
    await deleteAthlete({} as never, userId, "lindsay");
    expect(memory.docs.get(paths.userSettings(userId))?.activeAthleteId).toBe("alex");
    expect(memory.docs.has(paths.athleteProfile(userId, "lindsay"))).toBe(false);
  });

  it("clears the active athlete when the last one is deleted", async () => {
    seedShared();
    seedAthlete("lindsay", "Lindsay");
    await deleteAthlete({} as never, userId, "lindsay");
    expect(memory.docs.get(paths.userSettings(userId))).not.toHaveProperty("activeAthleteId");
    expect(memory.docs.get(paths.userSettings(userId))?.updatedAt).toBe(TIMESTAMP);
    expect(memory.docs.get(paths.userSettings(userId))?.parentPinHash).toBe("hash");
  });

  it("deletes a large collection across more than one batch", async () => {
    put(paths.userSettings(userId), { activeAthleteId: "lindsay" });
    put(paths.athleteProfile(userId, "lindsay"), { displayName: "Lindsay", userId });
    for (let index = 0; index < 500; index += 1) {
      put(`${paths.pointsLedgerCollection(userId, "lindsay")}/e${index}`, { n: index });
    }
    await deleteAthlete({} as never, userId, "lindsay");
    expect(memory.commits).toEqual([450, 50]);
    expect([...memory.docs.keys()].some((path) => path.includes("/pointsLedger/"))).toBe(false);
  });

  it("can be run again after a failed batch and finishes the delete", async () => {
    seedShared();
    seedAthlete("lindsay", "Lindsay");
    memory.failCommits = 1;
    await expect(deleteAthlete({} as never, userId, "lindsay")).rejects.toThrow("batch-failed");
    expect(memory.docs.has(paths.athleteProfile(userId, "lindsay"))).toBe(true);
    await deleteAthlete({} as never, userId, "lindsay");
    expect(memory.docs.has(paths.athleteProfile(userId, "lindsay"))).toBe(false);
    expect(memory.docs.has(paths.journalDay(userId, "2026-11-01"))).toBe(true);
    expect(memory.docs.get(paths.userSettings(userId))).not.toHaveProperty("activeAthleteId");
    await deleteAthlete({} as never, userId, "lindsay");
    expect(memory.docs.has(paths.journalDay(userId, "2026-11-01"))).toBe(true);
  });
});
