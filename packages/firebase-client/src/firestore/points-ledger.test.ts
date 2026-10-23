import { createDefaultRewardsCatalog, paths } from "@skatingx/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

const firestore = vi.hoisted(() => {
  const pathOf = (parts: unknown[]) => parts.filter((part) => typeof part === "string").join("/");
  const tx = {
    get: async (target: { kind?: string; path?: string; ref?: { path: string }; limit?: number }) => {
      if (target.kind === "query") {
        const prefix = `${target.ref?.path ?? ""}/`;
        const found = [...store.entries()].filter(([path]) => path.startsWith(prefix));
        const limited = found.slice(0, target.limit ?? found.length);
        return {
          empty: limited.length === 0,
          docs: limited.map(([path, data]) => ({ id: path.split("/").at(-1), data: () => data })),
        };
      }
      const data = store.get(target.path ?? "");
      return { exists: () => data !== undefined, data: () => data };
    },
    set: (ref: { path: string }, data: Record<string, unknown>) => {
      store.set(ref.path, { ...data });
    },
    update: (ref: { path: string }, data: Record<string, unknown>) => {
      const prev = store.get(ref.path);
      if (!prev) throw new Error(`missing ${ref.path}`);
      store.set(ref.path, { ...prev, ...data });
    },
    delete: (ref: { path: string }) => {
      store.delete(ref.path);
    },
  };
  return {
    collection: (...parts: unknown[]) => ({ kind: "collection" as const, path: pathOf(parts) }),
    doc: (...parts: unknown[]) => ({ kind: "doc" as const, path: pathOf(parts) }),
    query: (ref: { path: string }, ...clauses: { kind?: string; n?: number }[]) => ({
      kind: "query" as const,
      ref,
      limit: clauses.find((clause) => clause.kind === "limit")?.n,
    }),
    limit: (n: number) => ({ kind: "limit" as const, n }),
    where: (...args: unknown[]) => ({ kind: "where" as const, args }),
    documentId: () => "documentId",
    onSnapshot: vi.fn(),
    deleteDoc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: async (target: { ref?: { path: string }; limit?: number }) => {
      const prefix = `${target.ref?.path ?? ""}/`;
      const found = [...store.entries()].filter(([path]) => path.startsWith(prefix));
      const limited = found.slice(0, target.limit ?? found.length);
      return {
        empty: limited.length === 0,
        docs: limited.map(([path, data]) => ({ id: path.split("/").at(-1), data: () => data })),
      };
    },
    setDoc: vi.fn(),
    serverTimestamp: () => "ts",
    runTransaction: async (_db: unknown, run: (transaction: typeof tx) => Promise<unknown>) => run(tx),
  };
});

vi.mock("firebase/firestore", () => firestore);

import { cancelPlanningCheckIn, completePlanningCheckIn } from "./planning-check-in";
import { ensurePointsOpeningBalance } from "./points-ledger";
import { deleteTaskHistoryDay } from "./task-history";
import { deleteTrainingTask, toggleTrainingTask } from "./training-tasks";
import { redeemReward } from "./training-rewards";

const userId = "user-1";
const athleteId = "lindsay";
const db = {} as never;
const actor = { db, userId, athleteId };
const today = "2026-10-23";

type LedgerRow = { id: string; delta: number; reason: string; dateId: string; refId?: string };

function put(path: string, data: object): void {
  store.set(path, { ...(data as Record<string, unknown>) });
}

function gamePath(): string {
  return paths.athleteGamification(userId, athleteId);
}

function seedGame(points: number, completedDays: string[] = [], streakDays = 0): void {
  put(gamePath(), { points, completedDays, streakDays });
}

function seedTasks(
  tasks: { id: string; completed: boolean }[],
  rates: { pointsPerTask?: number; dailyBonusPoints?: number } = {},
): void {
  put(paths.trainingState(userId, athleteId), {
    todayTasks: tasks.map((task) => ({
      id: task.id,
      text: task.id,
      completed: task.completed,
      createdAt: "2026-10-23T00:00:00.000Z",
      source: "manual",
    })),
    pointsPerTask: rates.pointsPerTask ?? 20,
    dailyBonusPoints: rates.dailyBonusPoints ?? 50,
    lastLoginDate: today,
  });
}

function ledger(): LedgerRow[] {
  const prefix = `${paths.pointsLedgerCollection(userId, athleteId)}/`;
  return [...store.entries()]
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, data]) => ({
      id: path.slice(prefix.length),
      delta: data.delta as number,
      reason: data.reason as string,
      dateId: data.dateId as string,
      refId: data.refId as string | undefined,
    }));
}

function points(): number {
  return store.get(gamePath())?.points as number;
}

function sum(): number {
  return ledger().reduce((total, event) => total + event.delta, 0);
}

async function expectChange(run: () => Promise<unknown>): Promise<LedgerRow[]> {
  const beforePoints = points();
  const before = new Set(ledger().map((event) => event.id));
  await run();
  const added = ledger().filter((event) => !before.has(event.id));
  const operation = added.filter((event) => event.reason !== "opening-balance");
  expect(points() - beforePoints).toBe(operation.reduce((total, event) => total + event.delta, 0));
  expect(points()).toBe(sum());
  return added;
}

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 23, 12, 0, 0));
});

describe("points ledger transactions", () => {
  it("writes one opening line for an existing balance and does not write it again", async () => {
    seedGame(80);
    await ensurePointsOpeningBalance(db, userId, athleteId, today);
    await ensurePointsOpeningBalance(db, userId, athleteId, today);
    expect(ledger()).toEqual([
      expect.objectContaining({ id: "opening", delta: 80, reason: "opening-balance", dateId: today }),
    ]);
    expect(points()).toBe(80);
    expect(points()).toBe(sum());
  });

  it("leaves a zero balance without an opening line", async () => {
    seedGame(0);
    await ensurePointsOpeningBalance(db, userId, athleteId, today);
    expect(ledger()).toEqual([]);
  });

  it("does not invent an opening line once any event exists", async () => {
    seedGame(50);
    put(paths.pointsLedger(userId, athleteId, "earlier"), {
      dateId: today,
      delta: 20,
      reason: "task-complete",
      createdAt: today,
    });
    await ensurePointsOpeningBalance(db, userId, athleteId, today);
    expect(ledger().map((event) => event.id)).toEqual(["earlier"]);
  });

  it("does not add a second opening line after events have been recorded", async () => {
    seedGame(50);
    seedTasks([{ id: "a", completed: false }]);
    await toggleTrainingTask(actor, "a");
    const before = ledger().filter((event) => event.reason === "opening-balance");
    await ensurePointsOpeningBalance(db, userId, athleteId, today);
    expect(ledger().filter((event) => event.reason === "opening-balance")).toEqual(before);
    expect(points()).toBe(sum());
  });

  it("records a task completion and the full-attendance bonus as separate events", async () => {
    seedGame(100);
    seedTasks([
      { id: "a", completed: true },
      { id: "b", completed: false },
    ]);
    const added = await expectChange(() => toggleTrainingTask(actor, "b"));
    expect(points()).toBe(170);
    expect(added.filter((event) => event.reason !== "opening-balance").map((event) => [event.reason, event.delta, event.refId])).toEqual([
      ["task-complete", 20, "b"],
      ["daily-bonus-add", 50, undefined],
    ]);
    expect(store.get(gamePath())?.completedDays).toEqual([today]);
  });

  it("records an uncomplete and the bonus removal, and stops at zero", async () => {
    seedGame(30, [today], 1);
    seedTasks([
      { id: "a", completed: true },
      { id: "b", completed: true },
    ]);
    const added = await expectChange(() => toggleTrainingTask(actor, "b"));
    expect(points()).toBe(0);
    expect(added.filter((event) => event.reason !== "opening-balance").map((event) => [event.reason, event.delta])).toEqual([
      ["task-uncomplete", -20],
      ["daily-bonus-remove", -10],
    ]);
    expect(store.get(gamePath())?.completedDays).toEqual([]);
    expect(store.get(gamePath())?.streakDays).toBe(0);
  });

  it("records deleting a completed task and the bonus it took with it", async () => {
    seedGame(70, [today], 1);
    seedTasks([{ id: "only", completed: true }]);
    const added = await expectChange(() => deleteTrainingTask(actor, "only"));
    expect(points()).toBe(0);
    expect(added.filter((event) => event.reason !== "opening-balance").map((event) => [event.reason, event.delta, event.refId])).toEqual([
      ["task-delete", -20, "only"],
      ["daily-bonus-remove", -50, undefined],
    ]);
    expect(store.get(paths.trainingState(userId, athleteId))?.todayTasks).toEqual([]);
  });

  it("adds plan points once and takes them back once", async () => {
    seedGame(100);
    const checked = await expectChange(() => completePlanningCheckIn(db, userId, athleteId, "jd_tech_mon"));
    expect(checked.filter((event) => event.reason === "plan-checkin")).toEqual([
      expect.objectContaining({ delta: 30, refId: "jd_tech_mon", dateId: today }),
    ]);
    expect(points()).toBe(130);

    const cancelled = await expectChange(() => cancelPlanningCheckIn(db, userId, athleteId, "jd_tech_mon"));
    expect(cancelled.map((event) => [event.reason, event.delta, event.refId])).toEqual([
      ["plan-uncheckin", -30, "jd_tech_mon"],
    ]);
    expect(points()).toBe(100);
    expect(store.has(paths.planningCheckIn(userId, athleteId, "jd_tech_mon"))).toBe(false);

    const again = await expectChange(() => cancelPlanningCheckIn(db, userId, athleteId, "jd_tech_mon"));
    expect(again).toEqual([]);
    expect(points()).toBe(100);
  });

  it("records a redemption as a negative event", async () => {
    seedGame(200);
    put(paths.trainingRewardsCatalog(userId, athleteId), createDefaultRewardsCatalog());
    const added = await expectChange(() => redeemReward(actor, "reward_ice_cream", "冰淇淋奖励", 80));
    const redeem = added.find((event) => event.reason === "reward-redeem");
    expect(redeem).toMatchObject({ delta: -80, dateId: today });
    expect(points()).toBe(120);
    expect(store.has(paths.trainingRedemption(userId, athleteId, redeem?.refId ?? ""))).toBe(true);
  });

  it("reclaims an archived day at the current rates, drops that full-attendance day, and recomputes the streak", async () => {
    seedGame(100, ["2026-10-21", "2026-10-22", "2026-10-23"], 3);
    seedTasks([], { pointsPerTask: 10, dailyBonusPoints: 5 });
    put(paths.taskHistory(userId, athleteId, "2026-10-22"), {
      dateId: "2026-10-22",
      tasks: [
        { id: "a", text: "a", completed: true },
        { id: "b", text: "b", completed: true },
        { id: "c", text: "c", completed: false },
      ],
    });
    const added = await expectChange(() => deleteTaskHistoryDay(db, userId, athleteId, "2026-10-22"));
    expect(added.filter((event) => event.reason === "history-delete")).toEqual([
      expect.objectContaining({ delta: -25, refId: "2026-10-22", dateId: "2026-10-22" }),
    ]);
    expect(points()).toBe(75);
    expect(store.has(paths.taskHistory(userId, athleteId, "2026-10-22"))).toBe(false);
    expect(store.get(gamePath())?.completedDays).toEqual(["2026-10-21", "2026-10-23"]);
    expect(store.get(gamePath())?.streakDays).toBe(1);
  });

  it("caps the archive reclaim at the current balance", async () => {
    seedGame(10, ["2026-10-22"]);
    seedTasks([], { pointsPerTask: 10, dailyBonusPoints: 5 });
    put(paths.taskHistory(userId, athleteId, "2026-10-22"), {
      tasks: [
        { id: "a", text: "a", completed: true },
        { id: "b", text: "b", completed: true },
      ],
    });
    const added = await expectChange(() => deleteTaskHistoryDay(db, userId, athleteId, "2026-10-22"));
    expect(added.filter((event) => event.reason === "history-delete").map((event) => event.delta)).toEqual([-10]);
    expect(points()).toBe(0);
    expect(store.get(gamePath())?.completedDays).toEqual([]);
  });

  it("does nothing when the archived day is already gone", async () => {
    seedGame(40);
    const added = await expectChange(() => deleteTaskHistoryDay(db, userId, athleteId, "2026-10-22"));
    expect(added.map((event) => event.reason)).toEqual(["opening-balance"]);
    expect(points()).toBe(40);
    const again = await expectChange(() => deleteTaskHistoryDay(db, userId, athleteId, "2026-10-22"));
    expect(again).toEqual([]);
    expect(points()).toBe(40);
  });

  it("keeps the balance equal to the opening line plus every later delta", async () => {
    seedGame(40);
    seedTasks([
      { id: "a", completed: false },
      { id: "b", completed: false },
    ]);
    await expectChange(() => toggleTrainingTask(actor, "a"));
    await expectChange(() => toggleTrainingTask(actor, "b"));
    await expectChange(() => toggleTrainingTask(actor, "b"));
    await expectChange(() => completePlanningCheckIn(db, userId, athleteId, "jd_tech_tue"));
    await expectChange(() => cancelPlanningCheckIn(db, userId, athleteId, "jd_tech_tue"));
    await expectChange(() => deleteTrainingTask(actor, "a"));
    expect(ledger().some((event) => event.reason === "opening-balance" && event.delta === 40)).toBe(true);
    expect(points()).toBe(sum());
  });
});
