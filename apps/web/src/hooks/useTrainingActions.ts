import {
  addTrainingTask,
  deleteTrainingTask,
  getFirestoreDb,
  toggleTrainingTask,
} from "@skatingx/firebase-client";
import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";

export function useTrainingActions() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const athleteId = settings?.activeAthleteId ?? "lindsay";

  const withActor = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (!uid) {
      throw new Error("Sign in required.");
    }
    const db = getFirestoreDb();
    if (!db) {
      throw new Error("Firestore is not available.");
    }
    setBusy(true);
    setActionError(null);
    try {
      return await fn();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Training action failed.";
      setActionError(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [uid]);

  const addTask = useCallback(
    async (text: string, target?: string) => {
      return withActor(() =>
        addTrainingTask({ db: getFirestoreDb()!, userId: uid!, athleteId }, text, target),
      );
    },
    [withActor, uid, athleteId],
  );

  const removeTask = useCallback(
    async (taskId: string) => {
      return withActor(() =>
        deleteTrainingTask({ db: getFirestoreDb()!, userId: uid!, athleteId }, taskId),
      );
    },
    [withActor, uid, athleteId],
  );

  const toggleTask = useCallback(
    async (taskId: string) => {
      return withActor(() =>
        toggleTrainingTask({ db: getFirestoreDb()!, userId: uid!, athleteId }, taskId),
      );
    },
    [withActor, uid, athleteId],
  );

  return { addTask, removeTask, toggleTask, busy, actionError, clearActionError: () => setActionError(null) };
}
