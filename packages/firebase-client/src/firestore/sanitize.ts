import type { TaskHistoryDay, TimeEntry, TrainingTask } from "@skatingx/schema";
import type { DocumentData } from "firebase/firestore";

/**
 * Recursively removes `undefined` values from plain objects and arrays.
 * Firestore rejects `undefined` in writes.
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined) as T;
  }
  if (typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) {
        continue;
      }
      const sanitized = sanitizeForFirestore(entry);
      if (sanitized !== undefined) {
        out[key] = sanitized;
      }
    }
    return out as T;
  }
  return value;
}

/** Task payload safe for Firestore (no undefined; no completedAt until completed). */
export function serializeTrainingTask(task: TrainingTask): TrainingTask {
  const target = task.target?.trim();
  const description = (task.description ?? task.desc)?.trim();

  const serialized: TrainingTask = {
    id: task.id,
    text: task.text,
    source: task.source ?? "manual",
    completed: task.completed,
    createdAt: task.createdAt,
  };

  if (target) {
    serialized.target = target;
  }
  if (description) {
    serialized.description = description;
  }
  if (task.completed && task.completedAt) {
    serialized.completedAt = task.completedAt;
  }
  if (task.academyItemId) {
    serialized.academyItemId = task.academyItemId;
  }
  if (task.planEntryId) {
    serialized.planEntryId = task.planEntryId;
  }
  if (task.tags && task.tags.length > 0) {
    serialized.tags = [...task.tags];
  }

  return serialized;
}

export function serializeTrainingTasks(tasks: TrainingTask[]): TrainingTask[] {
  return tasks.map(serializeTrainingTask);
}

export function toFirestoreData(data: DocumentData): DocumentData {
  return sanitizeForFirestore(data);
}

export function serializeTimeEntry(entry: TimeEntry): TimeEntry {
  const serialized: TimeEntry = {
    id: entry.id,
    date: entry.date,
    timeSeconds: entry.timeSeconds,
    source: entry.source ?? "manual",
    createdAt: entry.createdAt,
  };
  const note = entry.note?.trim();
  if (note) {
    serialized.note = note;
  }
  if (entry.updatedAt) {
    serialized.updatedAt = entry.updatedAt;
  }
  return serialized;
}

export function serializeTimeEntries(entries: TimeEntry[]): TimeEntry[] {
  return entries.map(serializeTimeEntry);
}

export function serializeTaskHistoryDay(day: TaskHistoryDay): TaskHistoryDay {
  return sanitizeForFirestore({
    dateId: day.dateId,
    tasks: serializeTrainingTasks(day.tasks),
    archivedAt: day.archivedAt,
  });
}
