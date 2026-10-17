import {
  addTrainingTask,
  deleteTrainingTask,
  toggleTrainingTask,
} from "@skatingx/firebase-client";
import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import {
  type TrainingTasksMessageKey,
  tTrainingTasks,
} from "@/shared/i18n/training-tasks-messages";

import { ActionPreconditionError, requireActor } from "./actionPrecondition";

type ActionErrorNote = { key: TrainingTasksMessageKey } | { received: string };

export function useTrainingActions() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const [busy, setBusy] = useState(false);
  // What happened, not the sentence, so the message follows the language if it changes. A message
  // from the data layer is kept as it arrived.
  const [errorNote, setErrorNote] = useState<ActionErrorNote | null>(null);
  const language = useLocale();
  const actionError = errorNote
    ? "received" in errorNote
      ? errorNote.received
      : tTrainingTasks(language, errorNote.key)
    : null;

  const athleteId = settings?.activeAthleteId ?? "lindsay";

  const withActor = useCallback(
    async <T,>(
      fn: (ctx: { db: ReturnType<typeof requireActor>["db"]; userId: string; athleteId: string }) => Promise<T>,
    ): Promise<T> => {
      setBusy(true);
      setErrorNote(null);
      try {
        // Inside the try: "not signed in" and "no data service" are shown to the user too.
        return await fn({ ...requireActor(uid), athleteId });
      } catch (error) {
        setErrorNote(
          error instanceof ActionPreconditionError
            ? {
                key:
                  error.kind === "notSignedIn"
                    ? "trainingTasks.error.notSignedIn"
                    : "trainingTasks.error.unavailable",
              }
            : error instanceof Error
              ? { received: error.message }
              : { key: "trainingTasks.error.actionFailed" },
        );
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [uid, athleteId],
  );

  const addTask = useCallback(
    async (text: string, target?: string) =>
      withActor((ctx) => addTrainingTask(ctx, text, target)),
    [withActor],
  );

  const removeTask = useCallback(
    async (taskId: string) => withActor((ctx) => deleteTrainingTask(ctx, taskId)),
    [withActor],
  );

  const toggleTask = useCallback(
    async (taskId: string) => withActor((ctx) => toggleTrainingTask(ctx, taskId)),
    [withActor],
  );

  return { addTask, removeTask, toggleTask, busy, actionError, clearActionError: () => setErrorNote(null) };
}
