import { readFileSync } from "node:fs";

import { paths } from "@skatingx/schema";
import { normalizeTrainingState } from "@skatingx/skating-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

const firestore = vi.hoisted(() => {
  const pathOf = (parts: unknown[]) => parts.filter((part) => typeof part === "string").join("/");
  const tx = {
    get: async (target: { path?: string }) => {
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
    query: (ref: { path: string }) => ({ kind: "query" as const, ref }),
    limit: (n: number) => ({ kind: "limit" as const, n }),
    getDocs: async (target: { ref?: { path: string } }) => {
      const prefix = `${target.ref?.path ?? ""}/`;
      const found = [...store.entries()].filter(([path]) => path.startsWith(prefix));
      return { empty: found.length === 0, docs: found.map(([path, data]) => ({ id: path.split("/").at(-1), data: () => data })) };
    },
    updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
      tx.update(ref, data);
    },
    serverTimestamp: () => "ts",
    runTransaction: async (_db: unknown, run: (transaction: typeof tx) => Promise<unknown>) => run(tx),
  };
});

vi.mock("firebase/firestore", () => firestore);

import { archivedDayFromDocument } from "./task-history";
import { generatePlanTasksIfNeeded, setPlanFocus } from "./training-plan";
import { deleteTrainingTask, runDayRolloverIfNeeded, toggleTrainingTask } from "./training-tasks";

const userId = "user-1";
const athleteId = "lindsay";
const actor = { db: {} as never, userId, athleteId };
const statePath = paths.trainingState(userId, athleteId);
const gamePath = paths.athleteGamification(userId, athleteId);
const today = "2026-10-29"; // a Thursday
const thisMonday = "2026-10-26";

const candidates = [
  { planEntryId: "jd_tech_thu.1", text: "轻松骑车或慢跑", target: "20分钟", description: "恢复" },
  { planEntryId: "jd_tech_thu.2", text: "髋屈肌与腘绳肌拉伸", description: "恢复" },
  { planEntryId: "jd_tech_thu.3", text: "小腿拉伸", description: "恢复" },
];
const input = { focus: "lean" as const, candidates };

function seed(extra: Record<string, unknown> = {}) {
  store.set(statePath, {
    todayTasks: [],
    lastLoginDate: today,
    pointsPerTask: 20,
    dailyBonusPoints: 50,
    planFocus: "lean",
    planFocusWeek: thisMonday,
    ...extra,
  });
  store.set(gamePath, { points: 0, completedDays: [], streakDays: 0 });
}

const tasks = () => (store.get(statePath)?.todayTasks ?? []) as { id: string; text: string; source?: string; planEntryId?: string; completed: boolean }[];

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 29, 12, 0, 0));
});

describe("setPlanFocus", () => {
  it("stores the focus with the Monday of this week", async () => {
    seed({ planFocus: undefined, planFocusWeek: undefined });
    await setPlanFocus(actor, "bounce", "2026-11-01"); // a Sunday: still the week that began 26 October
    expect(store.get(statePath)).toMatchObject({ planFocus: "bounce", planFocusWeek: thisMonday });
    expect(store.get(statePath)?.todayTasks).toEqual([]);
  });
});

describe("generatePlanTasksIfNeeded", () => {
  it("adds the day's tasks once and marks the day", async () => {
    seed();
    expect(await generatePlanTasksIfNeeded(actor, input, today)).toEqual({ generated: 3, skipped: null });
    expect(tasks().map((task) => [task.text, task.source, task.planEntryId, task.completed])).toEqual([
      ["轻松骑车或慢跑", "plan", "jd_tech_thu.1", false],
      ["髋屈肌与腘绳肌拉伸", "plan", "jd_tech_thu.2", false],
      ["小腿拉伸", "plan", "jd_tech_thu.3", false],
    ]);
    expect(tasks()[0]).toMatchObject({ target: "20分钟", description: "恢复" });
    expect(store.get(statePath)?.planGeneratedDate).toBe(today);
  });

  it("does not add anything on a second or third call the same day", async () => {
    seed();
    await generatePlanTasksIfNeeded(actor, input, today);
    const before = JSON.stringify(store.get(statePath)?.todayTasks);
    expect(await generatePlanTasksIfNeeded(actor, input, today)).toEqual({ generated: 0, skipped: "already-generated" });
    expect(await generatePlanTasksIfNeeded(actor, input, today)).toEqual({ generated: 0, skipped: "already-generated" });
    expect(JSON.stringify(store.get(statePath)?.todayTasks)).toBe(before);
    expect(tasks()).toHaveLength(3);
  });

  it("does not bring a deleted task back", async () => {
    seed();
    await generatePlanTasksIfNeeded(actor, input, today);
    await deleteTrainingTask(actor, tasks()[1]!.id);
    expect(tasks().map((task) => task.planEntryId)).toEqual(["jd_tech_thu.1", "jd_tech_thu.3"]);
    expect(await generatePlanTasksIfNeeded(actor, input, today)).toEqual({ generated: 0, skipped: "already-generated" });
    expect(tasks().map((task) => task.planEntryId)).toEqual(["jd_tech_thu.1", "jd_tech_thu.3"]);
  });

  it("leaves manual and Academy tasks as they were, and adds after them", async () => {
    const mine = { id: "m1", text: "mine", source: "manual", completed: true, createdAt: "t", completedAt: "t" };
    const academy = { id: "a1", text: "drill", source: "academy", academyItemId: "item-1", completed: false, createdAt: "t" };
    seed({ todayTasks: [mine, academy] });
    await generatePlanTasksIfNeeded(actor, input, today);
    expect(tasks().slice(0, 2)).toEqual([mine, academy]);
    expect(tasks().slice(2).every((task) => task.source === "plan")).toBe(true);
    expect(tasks()).toHaveLength(5);
  });

  it("skips an entry that is already on the list", async () => {
    seed({ todayTasks: [{ id: "p1", text: "x", source: "plan", planEntryId: "jd_tech_thu.2", completed: false, createdAt: "t" }] });
    expect(await generatePlanTasksIfNeeded(actor, input, today)).toEqual({ generated: 2, skipped: null });
    expect(tasks().map((task) => task.planEntryId)).toEqual(["jd_tech_thu.2", "jd_tech_thu.1", "jd_tech_thu.3"]);
  });

  it("writes nothing while lastLoginDate is before today", async () => {
    seed({ lastLoginDate: "2026-10-28", todayTasks: [{ id: "old", text: "yesterday", source: "manual", completed: false, createdAt: "t" }] });
    const before = JSON.stringify(store.get(statePath));
    expect(await generatePlanTasksIfNeeded(actor, input, today)).toEqual({ generated: 0, skipped: "not-rolled-over" });
    expect(JSON.stringify(store.get(statePath))).toBe(before);
  });

  it("writes nothing for a focus chosen in another week, or none", async () => {
    seed({ planFocusWeek: "2026-10-19" });
    const stale = JSON.stringify(store.get(statePath));
    expect(await generatePlanTasksIfNeeded(actor, input, today)).toEqual({ generated: 0, skipped: "stale-focus-week" });
    expect(JSON.stringify(store.get(statePath))).toBe(stale);

    seed({ planFocus: undefined });
    expect(await generatePlanTasksIfNeeded(actor, input, today)).toEqual({ generated: 0, skipped: "no-focus" });
    expect(tasks()).toEqual([]);
  });

  it("abandons a call built for a different focus than the one stored", async () => {
    seed();
    const before = JSON.stringify(store.get(statePath));
    expect(await generatePlanTasksIfNeeded(actor, { focus: "bounce", candidates }, today)).toEqual({
      generated: 0,
      skipped: "focus-mismatch",
    });
    expect(JSON.stringify(store.get(statePath))).toBe(before);
  });

  it("marks a rest day that has no tasks to add, so it is not tried again", async () => {
    seed();
    expect(await generatePlanTasksIfNeeded(actor, { focus: "lean", candidates: [] }, today)).toEqual({ generated: 0, skipped: null });
    expect(store.get(statePath)?.planGeneratedDate).toBe(today);
    expect(await generatePlanTasksIfNeeded(actor, input, today)).toEqual({ generated: 0, skipped: "already-generated" });
    expect(tasks()).toEqual([]);
  });

  it("needs no settings and no PRO flag, and the module does not read one", async () => {
    seed();
    // Nothing but the training state and the gamification document exist in the store.
    expect((await generatePlanTasksIfNeeded(actor, input, today)).generated).toBe(3);
    const source = readFileSync(new URL("./training-plan.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/isPro|useIsPro|settingsRef/);
  });
});

describe("a generated task through toggle and the day archive", () => {
  it("keeps source and planEntryId when toggled, archived and read back", async () => {
    seed();
    await generatePlanTasksIfNeeded(actor, input, today);
    const first = tasks()[0]!;
    await toggleTrainingTask(actor, first.id);

    // After the toggle, which rewrites the whole list through normalize and serialize.
    expect(tasks().map((task) => [task.source, task.planEntryId, task.completed])).toEqual([
      ["plan", "jd_tech_thu.1", true],
      ["plan", "jd_tech_thu.2", false],
      ["plan", "jd_tech_thu.3", false],
    ]);
    // The scoring is the ordinary task rule, nothing plan-specific.
    expect(store.get(gamePath)?.points).toBe(20);

    // The next day's rollover archives the list.
    const state = normalizeTrainingState(store.get(statePath) as never);
    expect(await runDayRolloverIfNeeded(actor, state, "2026-10-30")).toBe(true);
    const archived = store.get(paths.taskHistory(userId, athleteId, today));
    expect(archived).toBeDefined();
    const day = archivedDayFromDocument(today, archived!);
    expect(day?.tasks.map((task) => [task.source, task.planEntryId, task.completed])).toEqual([
      ["plan", "jd_tech_thu.1", true],
      ["plan", "jd_tech_thu.2", false],
      ["plan", "jd_tech_thu.3", false],
    ]);
    // The plan marker is not cleared by the rollover: a new day has a new date.
    expect(store.get(statePath)?.planGeneratedDate).toBe(today);
    expect(tasks()).toEqual([]);
  });
});
