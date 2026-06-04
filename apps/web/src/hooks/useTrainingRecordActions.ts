import {
  addTimeEntry,
  deleteTimeEntry,
  getFirestoreDb,
  updateTimeEntry,
  type RecordsActorContext,
} from "@skatingx/firebase-client";
import type { TimeEntrySource } from "@skatingx/schema";
import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";

export function useTrainingRecordActions() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const athleteId = settings?.activeAthleteId ?? "lindsay";

  const getContext = useCallback((): RecordsActorContext => {
    if (!uid) {
      throw new Error("Sign in required.");
    }
    const db = getFirestoreDb();
    if (!db) {
      throw new Error("Firestore is not available.");
    }
    return { db, userId: uid, athleteId };
  }, [uid, athleteId]);

  const withActor = useCallback(
    async <T,>(fn: (ctx: RecordsActorContext) => Promise<T>): Promise<T> => {
      setBusy(true);
      setActionError(null);
      try {
        return await fn(getContext());
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Record action failed.";
        setActionError(message);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [getContext],
  );

  const addEntry = useCallback(
    async (
      distanceId: string,
      label: string,
      input: {
        date: string;
        timeSeconds: number;
        source?: TimeEntrySource;
        note?: string;
      },
    ) => withActor((ctx) => addTimeEntry(ctx, distanceId, label, input)),
    [withActor],
  );

  const editEntry = useCallback(
    async (
      distanceId: string,
      label: string,
      entryId: string,
      input: {
        date: string;
        timeSeconds: number;
        source?: TimeEntrySource;
        note?: string;
      },
    ) => withActor((ctx) => updateTimeEntry(ctx, distanceId, label, entryId, input)),
    [withActor],
  );

  const removeEntry = useCallback(
    async (distanceId: string, label: string, entryId: string) =>
      withActor((ctx) => deleteTimeEntry(ctx, distanceId, label, entryId)),
    [withActor],
  );

  return {
    addEntry,
    editEntry,
    removeEntry,
    busy,
    actionError,
    clearActionError: () => setActionError(null),
  };
}
