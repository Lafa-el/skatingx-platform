import { applyPlanCheckIn, planDayById } from "@skatingx/skating-domain";
import type { Gamification } from "@skatingx/schema";
import {
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

import { athleteGamificationRef, planningCheckInRef, planningCheckInsCollectionRef } from "./refs";
import { toFirestoreData } from "./sanitize";

export type PlanningCheckIn = {
  readonly taskId: string;
  readonly points: number;
};

/**
 * Live list of plan check-ins. The caller must use the returned unsubscribe
 * when the page goes away (ADR-005 §4).
 */
export function subscribeToPlanningCheckIns(
  db: Firestore,
  userId: string,
  athleteId: string,
  onData: (checkIns: readonly PlanningCheckIn[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    planningCheckInsCollectionRef(db, userId, athleteId),
    (snapshot) => {
      onData(
        snapshot.docs.map((item) => {
          const data = item.data();
          const taskId = typeof data.taskId === "string" ? data.taskId : item.id;
          const points = typeof data.points === "number" ? data.points : 0;
          return { taskId, points };
        }),
      );
    },
    (error) => onError(error),
  );
}

/**
 * Writes one check-in and adds its template points to the training balance.
 * A second call for the same task does not add points again. The day text is
 * not stored.
 */
export async function completePlanningCheckIn(
  db: Firestore,
  userId: string,
  athleteId: string,
  taskId: string,
): Promise<"saved" | "already"> {
  const day = planDayById(taskId);
  if (!day) {
    throw new Error("unknown-plan-day");
  }
  const taskRef = planningCheckInRef(db, userId, athleteId, taskId);
  const gamificationRef = athleteGamificationRef(db, userId, athleteId);

  return runTransaction(db, async (tx) => {
    const taskSnap = await tx.get(taskRef);
    if (taskSnap.exists()) return "already";

    const gamificationSnap = await tx.get(gamificationRef);
    const current = gamificationSnap.data() as Gamification | undefined;
    const points = applyPlanCheckIn(current?.points ?? 0, day.points, false);

    tx.set(
      taskRef,
      toFirestoreData({
        taskId: day.id,
        points: day.points,
        focus: day.focus,
        athleteId,
        ownerUserId: userId,
        completedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    if (gamificationSnap.exists()) {
      tx.update(gamificationRef, toFirestoreData({ points, updatedAt: serverTimestamp() }));
    } else {
      tx.set(
        gamificationRef,
        toFirestoreData({
          points,
          streakDays: 0,
          completedDays: [],
          updatedAt: serverTimestamp(),
        }),
      );
    }
    return "saved";
  });
}
