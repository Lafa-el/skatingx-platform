import { planDayById } from "@skatingx/skating-domain";
import { todayDateString, type Gamification } from "@skatingx/schema";
import {
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

import { athleteGamificationRef, planningCheckInRef, planningCheckInsCollectionRef } from "./refs";
import { recordPointsChange } from "./points-ledger";
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
  const today = todayDateString();

  return runTransaction(db, async (tx) => {
    const taskSnap = await tx.get(taskRef);
    const gamificationSnap = await tx.get(gamificationRef);
    const current = gamificationSnap.data() as Gamification | undefined;
    if (taskSnap.exists()) {
      await recordPointsChange(tx, db, userId, athleteId, current?.points ?? 0, [], today);
      return "already";
    }
    const points = await recordPointsChange(
      tx,
      db,
      userId,
      athleteId,
      current?.points ?? 0,
      [{ dateId: today, delta: day.points, reason: "plan-checkin", refId: day.id }],
      today,
    );

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

/**
 * Removes one check-in and takes back the points that check-in stored.
 * A second call finds no document and does not take points again.
 */
export async function cancelPlanningCheckIn(
  db: Firestore,
  userId: string,
  athleteId: string,
  taskId: string,
): Promise<"cancelled" | "missing"> {
  const day = planDayById(taskId);
  if (!day) {
    throw new Error("unknown-plan-day");
  }
  const taskRef = planningCheckInRef(db, userId, athleteId, taskId);
  const gamificationRef = athleteGamificationRef(db, userId, athleteId);
  const today = todayDateString();

  return runTransaction(db, async (tx) => {
    const taskSnap = await tx.get(taskRef);
    const gamificationSnap = await tx.get(gamificationRef);
    const current = gamificationSnap.data() as Gamification | undefined;
    const todayPoints = current?.points ?? 0;
    if (!taskSnap.exists()) {
      await recordPointsChange(tx, db, userId, athleteId, todayPoints, [], today);
      return "missing";
    }

    const stored = taskSnap.data() as { points?: unknown };
    const awarded = typeof stored.points === "number" ? stored.points : day.points;
    const points = await recordPointsChange(
      tx,
      db,
      userId,
      athleteId,
      todayPoints,
      [{ dateId: today, delta: -awarded, reason: "plan-uncheckin", refId: day.id }],
      today,
    );

    tx.delete(taskRef);
    if (gamificationSnap.exists()) {
      tx.update(gamificationRef, toFirestoreData({ points, updatedAt: serverTimestamp() }));
    }
    return "cancelled";
  });
}
