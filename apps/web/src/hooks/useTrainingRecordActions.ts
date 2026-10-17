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
import { useLocale } from "@/hooks/useLocale";
import { type RecordsMessageKey, tRecords } from "@/shared/i18n/records-messages";

/** Thrown before anything is written, so the page can say why in the user's language. */
class RecordsUnavailableError extends Error {
  constructor(readonly key: RecordsMessageKey) {
    super(key);
    this.name = "RecordsUnavailableError";
  }
}

export function useTrainingRecordActions() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const [busy, setBusy] = useState(false);
  // What happened, not the sentence, so the message follows the language if it changes. A message
  // from the data layer is kept as it arrived.
  const [errorNote, setErrorNote] = useState<{ key: RecordsMessageKey } | { received: string } | null>(null);
  const language = useLocale();
  const actionError = errorNote
    ? "received" in errorNote
      ? errorNote.received
      : tRecords(language, errorNote.key)
    : null;

  const athleteId = settings?.activeAthleteId ?? "lindsay";

  const getContext = useCallback((): RecordsActorContext => {
    if (!uid) {
      throw new RecordsUnavailableError("records.error.notSignedIn");
    }
    const db = getFirestoreDb();
    if (!db) {
      throw new RecordsUnavailableError("records.error.unavailable");
    }
    return { db, userId: uid, athleteId };
  }, [uid, athleteId]);

  const withActor = useCallback(
    async <T,>(fn: (ctx: RecordsActorContext) => Promise<T>): Promise<T> => {
      setBusy(true);
      setErrorNote(null);
      try {
        return await fn(getContext());
      } catch (error) {
        // The error is still thrown: the page relies on that to keep the form as it was.
        setErrorNote(
          error instanceof RecordsUnavailableError
            ? { key: error.key }
            : error instanceof Error
              ? { received: error.message }
              : { key: "records.error.actionFailed" },
        );
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
    clearActionError: () => setErrorNote(null),
  };
}
