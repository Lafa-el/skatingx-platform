import type { DateString, Gamification, TrainingState, TrainingTask } from "@skatingx/schema";
import {
  DEFAULT_DAILY_BONUS_POINTS,
  DEFAULT_POINTS_PER_TASK,
} from "@skatingx/schema";

import { calculateStreakDays } from "./streak";

export type TaskToggleResult = {
  training: Pick<TrainingState, "todayTasks">;
  gamification: Pick<Gamification, "points" | "completedDays" | "streakDays">;
  bonusApplied: boolean;
  bonusRemoved: boolean;
};

export function normalizeTrainingState(
  state: Partial<TrainingState> | null | undefined,
): TrainingState {
  const todayTasks = (state?.todayTasks ?? []).map(normalizeTask);
  return {
    todayTasks,
    weeklyTemplate: state?.weeklyTemplate ?? {
      monday: "",
      tuesday: "",
      wednesday: "",
      thursday: "",
      friday: "",
      saturday: "",
      sunday: "",
    },
    lastLoginDate: state?.lastLoginDate ?? "",
    pointsPerTask: state?.pointsPerTask ?? DEFAULT_POINTS_PER_TASK,
    dailyBonusPoints: state?.dailyBonusPoints ?? DEFAULT_DAILY_BONUS_POINTS,
    updatedAt: state?.updatedAt,
  };
}

export function normalizeTask(task: TrainingTask): TrainingTask {
  const normalized: TrainingTask = {
    id: String(task.id),
    text: task.text,
    source: task.source ?? "manual",
    completed: Boolean(task.completed),
    createdAt: task.createdAt ?? new Date().toISOString(),
  };
  const description = (task.description ?? task.desc)?.trim();
  if (description) {
    normalized.description = description;
  }
  const target = task.target?.trim();
  if (target) {
    normalized.target = target;
  }
  if (normalized.completed && task.completedAt) {
    normalized.completedAt = task.completedAt;
  }
  if (task.academyItemId) {
    normalized.academyItemId = task.academyItemId;
  }
  if (task.tags && task.tags.length > 0) {
    normalized.tags = [...task.tags];
  }
  return normalized;
}

export function allTasksCompleted(tasks: TrainingTask[]): boolean {
  return tasks.length > 0 && tasks.every((t) => t.completed);
}

export function applyTaskToggle(
  state: TrainingState,
  gamification: Gamification,
  taskId: string,
  today: DateString,
  nowIso: string,
): TaskToggleResult {
  const pointsPerTask = state.pointsPerTask ?? DEFAULT_POINTS_PER_TASK;
  const dailyBonusPoints = state.dailyBonusPoints ?? DEFAULT_DAILY_BONUS_POINTS;

  const wasAllCompleted = allTasksCompleted(state.todayTasks);
  let pointDelta = 0;

  const todayTasks = state.todayTasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }
    const completing = !task.completed;
    pointDelta += completing ? pointsPerTask : -pointsPerTask;
    const next: TrainingTask = {
      ...task,
      completed: completing,
    };
    if (completing) {
      next.completedAt = nowIso;
    } else {
      delete next.completedAt;
    }
    return next;
  });

  const isAllCompleted = allTasksCompleted(todayTasks);
  let completedDays = [...(gamification.completedDays ?? [])];
  let bonusApplied = false;
  let bonusRemoved = false;

  if (!wasAllCompleted && isAllCompleted) {
    pointDelta += dailyBonusPoints;
    if (!completedDays.includes(today)) {
      completedDays.push(today);
    }
    bonusApplied = true;
  } else if (wasAllCompleted && !isAllCompleted) {
    pointDelta -= dailyBonusPoints;
    completedDays = completedDays.filter((d) => d !== today);
    bonusRemoved = true;
  }

  const points = Math.max(0, (gamification.points ?? 0) + pointDelta);
  const streakDays = calculateStreakDays(completedDays, today);

  return {
    training: { todayTasks },
    gamification: { points, completedDays, streakDays },
    bonusApplied,
    bonusRemoved,
  };
}

export function createTaskId(existingIds: Set<string>): string {
  let id: string;
  do {
    id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  } while (existingIds.has(id));
  return id;
}
