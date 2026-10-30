import type { TrainingPlanFocus, TrainingState } from "@skatingx/schema";
import { todayDateString } from "@skatingx/schema";
import {
  buildTaskFromPlanCandidate,
  filterNewPlanCandidates,
  mondayOfWeek,
  normalizeTrainingState,
  planGenerationSkip,
  type PlanGenerationSkip,
  type PlanTaskCandidate,
} from "@skatingx/skating-domain";
import { runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";

import { trainingStateRef } from "./refs";
import { serializeTrainingTasks, toFirestoreData } from "./sanitize";
import type { TrainingActorContext } from "./training-tasks";

/**
 * Stores the week focus on `training/state` (ADR-008). The focus is valid for the calendar week it
 * was chosen in: `planFocusWeek` is that week's Monday. Choosing again later the same day does not
 * rewrite the tasks already generated today; the new focus applies from the next day.
 */
export async function setPlanFocus(
  ctx: TrainingActorContext,
  focus: TrainingPlanFocus,
  today: string = todayDateString(),
): Promise<void> {
  // Not a transaction: it reads nothing, and a plain write is queued and shown at once when offline.
  await updateDoc(
    trainingStateRef(ctx.db, ctx.userId, ctx.athleteId),
    toFirestoreData({
      planFocus: focus,
      planFocusWeek: mondayOfWeek(today),
      updatedAt: serverTimestamp(),
    }),
  );
}

export type GeneratePlanTasksResult =
  | { generated: number; skipped: null }
  | { generated: 0; skipped: PlanGenerationSkip };

/**
 * Adds today's plan tasks once. This is its own transaction and not part of the day rollover: the
 * rollover returns early on a day that needs no archive, and generation has to work on that day too.
 *
 * The idempotency marker is `planGeneratedDate`, not "a plan task exists": a task the user deleted
 * must not come back on the next open. The caller turns i18n keys into strings and passes the
 * focus it built the candidates for; a state that has a different focus abandons the call.
 */
export async function generatePlanTasksIfNeeded(
  ctx: TrainingActorContext,
  input: { focus: TrainingPlanFocus; candidates: readonly PlanTaskCandidate[] },
  today: string = todayDateString(),
): Promise<GeneratePlanTasksResult> {
  const stateRef = trainingStateRef(ctx.db, ctx.userId, ctx.athleteId);
  const nowIso = new Date().toISOString();

  return runTransaction(ctx.db, async (tx): Promise<GeneratePlanTasksResult> => {
    const snap = await tx.get(stateRef);
    const state = normalizeTrainingState(snap.data() as TrainingState | undefined);
    const skipped = planGenerationSkip(state, input.focus, today);
    if (skipped) return { generated: 0, skipped };

    const toAdd = filterNewPlanCandidates(state.todayTasks, input.candidates);
    const ids = new Set(state.todayTasks.map((task) => task.id));
    const added = toAdd.map((candidate) => {
      const task = buildTaskFromPlanCandidate(candidate, ids, nowIso);
      ids.add(task.id);
      return task;
    });

    // The marker is written even when nothing is added (a rest day), so the day is not retried.
    tx.update(
      stateRef,
      toFirestoreData({
        todayTasks: serializeTrainingTasks([...state.todayTasks, ...added]),
        planGeneratedDate: today,
        updatedAt: serverTimestamp(),
      }),
    );
    return { generated: added.length, skipped: null };
  });
}
