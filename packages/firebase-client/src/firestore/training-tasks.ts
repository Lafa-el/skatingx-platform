import type { Gamification, TrainingState } from "@skatingx/schema";
import { todayDateString } from "@skatingx/schema";
import {
  applyTaskToggle,
  buildTaskFromAcademyCandidate,
  calculateStreakDays,
  compareDateStrings,
  createTaskId,
  filterNewAcademyCandidates,
  normalizeTrainingState,
  normalizeTask,
  type AcademyImportCandidate,
} from "@skatingx/skating-domain";
import {
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

import {
  athleteGamificationRef,
  taskHistoryRef,
  trainingStateRef,
} from "./refs";
import { recordPointsChange } from "./points-ledger";
import {
  serializeTaskHistoryDay,
  serializeTrainingTask,
  serializeTrainingTasks,
  toFirestoreData,
} from "./sanitize";

export type TrainingActorContext = {
  db: Firestore;
  userId: string;
  athleteId: string;
};

function gamificationFromDoc(data: Gamification | undefined): Gamification {
  return {
    points: data?.points ?? 0,
    streakDays: data?.streakDays ?? 0,
    completedDays: data?.completedDays ?? [],
    pointsPerTask: data?.pointsPerTask,
    dailyBonusPoints: data?.dailyBonusPoints,
    updatedAt: data?.updatedAt,
  };
}

export async function runDayRolloverIfNeeded(
  ctx: TrainingActorContext,
  state: TrainingState,
  today: string = todayDateString(),
): Promise<boolean> {
  if (!state.lastLoginDate || compareDateStrings(today, state.lastLoginDate) <= 0) {
    return false;
  }

  const previousDate = state.lastLoginDate;
  const stateRef = trainingStateRef(ctx.db, ctx.userId, ctx.athleteId);

  await runTransaction(ctx.db, async (tx) => {
    if (state.todayTasks.length > 0) {
      const historyRef = taskHistoryRef(
        ctx.db,
        ctx.userId,
        ctx.athleteId,
        previousDate,
      );
      const payload = serializeTaskHistoryDay({
        dateId: previousDate,
        tasks: serializeTrainingTasks(state.todayTasks),
        archivedAt: new Date().toISOString(),
      });
      tx.set(historyRef, toFirestoreData(payload));
    }

    tx.update(
      stateRef,
      toFirestoreData({
        todayTasks: [],
        lastLoginDate: today,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  return true;
}

export async function addTrainingTask(
  ctx: TrainingActorContext,
  text: string,
  target?: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Task text cannot be empty.");
  }

  const stateRef = trainingStateRef(ctx.db, ctx.userId, ctx.athleteId);
  const nowIso = new Date().toISOString();

  await runTransaction(ctx.db, async (tx) => {
    const snap = await tx.get(stateRef);
    const raw = snap.data() as TrainingState | undefined;
    const state = normalizeTrainingState(raw);
    const ids = new Set(state.todayTasks.map((t) => t.id));
    const trimmedTarget = target?.trim();
    const task = serializeTrainingTask({
      id: createTaskId(ids),
      text: trimmed,
      ...(trimmedTarget ? { target: trimmedTarget } : {}),
      source: "manual",
      completed: false,
      createdAt: nowIso,
    });
    tx.update(
      stateRef,
      toFirestoreData({
        todayTasks: [...serializeTrainingTasks(state.todayTasks), task],
        updatedAt: serverTimestamp(),
      }),
    );
  });
}

export type AcademyImportResult = {
  imported: number;
  skipped: number;
};

export async function importAcademyTasks(
  ctx: TrainingActorContext,
  candidates: AcademyImportCandidate[],
): Promise<AcademyImportResult> {
  if (candidates.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  const stateRef = trainingStateRef(ctx.db, ctx.userId, ctx.athleteId);
  const nowIso = new Date().toISOString();

  return runTransaction(ctx.db, async (tx) => {
    const snap = await tx.get(stateRef);
    const raw = snap.data() as TrainingState | undefined;
    const state = normalizeTrainingState(raw);
    const { toImport, skipped } = filterNewAcademyCandidates(
      state.todayTasks,
      candidates,
    );

    if (toImport.length === 0) {
      return { imported: 0, skipped };
    }

    const ids = new Set(state.todayTasks.map((t) => t.id));
    const newTasks = toImport.map((candidate) => {
      const task = buildTaskFromAcademyCandidate(candidate, ids, nowIso);
      ids.add(task.id);
      return task;
    });

    tx.update(
      stateRef,
      toFirestoreData({
        todayTasks: serializeTrainingTasks([
          ...state.todayTasks,
          ...newTasks,
        ]),
        updatedAt: serverTimestamp(),
      }),
    );

    return { imported: newTasks.length, skipped };
  });
}

export async function deleteTrainingTask(
  ctx: TrainingActorContext,
  taskId: string,
): Promise<void> {
  const stateRef = trainingStateRef(ctx.db, ctx.userId, ctx.athleteId);
  const gamificationRef = athleteGamificationRef(
    ctx.db,
    ctx.userId,
    ctx.athleteId,
  );
  const today = todayDateString();

  await runTransaction(ctx.db, async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const gamificationSnap = await tx.get(gamificationRef);
    const state = normalizeTrainingState(
      stateSnap.data() as TrainingState | undefined,
    );
    const gamification = gamificationFromDoc(
      gamificationSnap.data() as Gamification | undefined,
    );

    const removed = state.todayTasks.find((t) => t.id === taskId);
    if (!removed) {
      await recordPointsChange(
        tx,
        ctx.db,
        ctx.userId,
        ctx.athleteId,
        gamification.points,
        [],
        today,
      );
      return;
    }

    const remaining = state.todayTasks.filter((t) => t.id !== taskId);
    const wasAllCompleted = state.todayTasks.every((t) => t.completed);
    const stillAllCompleted =
      remaining.length > 0 && remaining.every((t) => t.completed);

    let completedDays = [...gamification.completedDays];
    const drafts = [];
    if (removed.completed) {
      drafts.push({
        dateId: today,
        delta: -state.pointsPerTask,
        reason: "task-delete" as const,
        refId: taskId,
      });
    }
    if (wasAllCompleted && !stillAllCompleted && remaining.length >= 0) {
      drafts.push({
        dateId: today,
        delta: -state.dailyBonusPoints,
        reason: "daily-bonus-remove" as const,
      });
      completedDays = completedDays.filter((d) => d !== today);
    }

    const points = await recordPointsChange(
      tx,
      ctx.db,
      ctx.userId,
      ctx.athleteId,
      gamification.points,
      drafts,
      today,
    );
    const streakDays = calculateStreakDays(completedDays, today);

    tx.update(
      stateRef,
      toFirestoreData({
        todayTasks: serializeTrainingTasks(remaining),
        updatedAt: serverTimestamp(),
      }),
    );
    tx.update(
      gamificationRef,
      toFirestoreData({
        points,
        completedDays,
        streakDays,
        updatedAt: serverTimestamp(),
      }),
    );
  });
}

export async function toggleTrainingTask(
  ctx: TrainingActorContext,
  taskId: string,
): Promise<{ bonusApplied: boolean; bonusRemoved: boolean }> {
  const stateRef = trainingStateRef(ctx.db, ctx.userId, ctx.athleteId);
  const gamificationRef = athleteGamificationRef(
    ctx.db,
    ctx.userId,
    ctx.athleteId,
  );
  const today = todayDateString();
  const nowIso = new Date().toISOString();

  let bonusApplied = false;
  let bonusRemoved = false;

  await runTransaction(ctx.db, async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const gamificationSnap = await tx.get(gamificationRef);
    const state = normalizeTrainingState(
      stateSnap.data() as TrainingState | undefined,
    );
    const gamification = gamificationFromDoc(
      gamificationSnap.data() as Gamification | undefined,
    );

    const result = applyTaskToggle(
      state,
      gamification,
      taskId,
      today,
      nowIso,
    );
    bonusApplied = result.bonusApplied;
    bonusRemoved = result.bonusRemoved;

    const toggled = state.todayTasks.find((task) => task.id === taskId);
    const drafts = [];
    if (toggled) {
      drafts.push({
        dateId: today,
        delta: toggled.completed ? -state.pointsPerTask : state.pointsPerTask,
        reason: toggled.completed ? ("task-uncomplete" as const) : ("task-complete" as const),
        refId: taskId,
      });
    }
    if (result.bonusApplied) {
      drafts.push({
        dateId: today,
        delta: state.dailyBonusPoints,
        reason: "daily-bonus-add" as const,
      });
    }
    if (result.bonusRemoved) {
      drafts.push({
        dateId: today,
        delta: -state.dailyBonusPoints,
        reason: "daily-bonus-remove" as const,
      });
    }
    const points = await recordPointsChange(
      tx,
      ctx.db,
      ctx.userId,
      ctx.athleteId,
      gamification.points,
      drafts,
      today,
    );

    tx.update(
      stateRef,
      toFirestoreData({
        todayTasks: serializeTrainingTasks(result.training.todayTasks),
        updatedAt: serverTimestamp(),
      }),
    );
    tx.update(
      gamificationRef,
      toFirestoreData({
        points,
        completedDays: result.gamification.completedDays,
        streakDays: result.gamification.streakDays,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  return { bonusApplied, bonusRemoved };
}

/** Recompute streak from completedDays (e.g. after rollover). */
export async function syncStreakDays(
  ctx: TrainingActorContext,
  completedDays: string[],
  today: string = todayDateString(),
): Promise<void> {
  const gamificationRef = athleteGamificationRef(
    ctx.db,
    ctx.userId,
    ctx.athleteId,
  );
  const streakDays = calculateStreakDays(completedDays, today);
  await runTransaction(ctx.db, async (tx) => {
    tx.update(
      gamificationRef,
      toFirestoreData({
        streakDays,
        updatedAt: serverTimestamp(),
      }),
    );
  });
}

export { normalizeTask, normalizeTrainingState };
