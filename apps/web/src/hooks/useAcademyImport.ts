import {
  getFirestoreDb,
  importAcademyTasks,
  type AcademyImportResult,
} from "@skatingx/firebase-client";
import {
  buildAcademyImportCandidate,
  matchRoutineTaskLabel,
  type AcademyImportCandidate,
} from "@skatingx/skating-domain";
import type { AcademyItem, AcademyStage, WeekdayKey } from "@skatingx/content";
import { getWeekdayRoutineItems } from "@skatingx/content";
import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { tAcademy } from "@/shared/i18n/academy-messages";

/**
 * What the user is told when an import fails. It keeps what happened, not the sentence, so it
 * follows the language if it changes afterwards. A message that came from the data layer is shown
 * as it arrived.
 */
type ImportErrorNote = { failed: true } | { received: string };

export function useAcademyImport() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const [busy, setBusy] = useState(false);
  const [errorNote, setErrorNote] = useState<ImportErrorNote | null>(null);
  const [lastResult, setLastResult] = useState<AcademyImportResult | null>(null);

  const athleteId = settings?.activeAthleteId ?? "lindsay";
  const language = useLocale();
  const actionError = errorNote
    ? "received" in errorNote
      ? errorNote.received
      : tAcademy(language, "academy.error.importFailed")
    : null;

  const runImport = useCallback(
    async (candidates: AcademyImportCandidate[]) => {
      if (!uid) {
        throw new Error("Sign in required.");
      }
      const db = getFirestoreDb();
      if (!db) {
        throw new Error("Firestore is not available.");
      }
      setBusy(true);
      setErrorNote(null);
      try {
        const result = await importAcademyTasks(
          { db, userId: uid, athleteId },
          candidates,
        );
        setLastResult(result);
        return result;
      } catch (error) {
        setErrorNote(error instanceof Error ? { received: error.message } : { failed: true });
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [uid, athleteId],
  );

  const importItem = useCallback(
    async (item: AcademyItem) => {
      const candidate = buildAcademyImportCandidate(item, language);
      return runImport([candidate]);
    },
    [language, runImport],
  );

  const importWeekdayRoutine = useCallback(
    async (stage: AcademyStage, weekday: WeekdayKey, requirePro = true) => {
      if (requirePro && settings?.isPro !== true) {
        throw new Error(tAcademy(language, "academy.error.proRequired"));
      }
      const routineItems = getWeekdayRoutineItems(stage, weekday);
      const candidates: AcademyImportCandidate[] = [];

      for (const routineItem of routineItems) {
        const matched = matchRoutineTaskLabel(stage, routineItem.taskLabel);
        if (matched) {
          candidates.push(buildAcademyImportCandidate(matched, language));
        } else {
          const parts = routineItem.taskLabel.split(" ");
          const target = parts.length > 1 ? parts.pop() : "";
          const name = parts.join(" ").trim() || routineItem.taskLabel;
          candidates.push({
            academyItemId: `routine-fallback-${routineItem.routineItemId}`,
            text: name,
            target: target || undefined,
            tags: ["academy-routine"],
          });
        }
      }

      return runImport(candidates);
    },
    [language, runImport, settings?.isPro],
  );

  const importDayPlan = useCallback(
    async (stage: AcademyStage, dayPlanId: string, requirePro = true) => {
      if (requirePro && settings?.isPro !== true) {
        throw new Error(tAcademy(language, "academy.error.proRequired"));
      }
      const plan = stage.weeklyRoutine.dayPlans.find((p) => p.id === dayPlanId);
      if (!plan) {
        throw new Error("Day plan not found.");
      }
      const candidates: AcademyImportCandidate[] = [];
      for (const taskLabel of plan.taskLabels) {
        const matched = matchRoutineTaskLabel(stage, taskLabel);
        if (matched) {
          candidates.push(buildAcademyImportCandidate(matched, language));
        } else {
          const parts = taskLabel.split(" ");
          const target = parts.length > 1 ? parts.pop() : "";
          const name = parts.join(" ").trim() || taskLabel;
          candidates.push({
            academyItemId: `plan-fallback-${plan.id}-${name}`,
            text: name,
            target: target || undefined,
            tags: ["academy-routine"],
          });
        }
      }
      return runImport(candidates);
    },
    [language, runImport, settings?.isPro],
  );

  return {
    importItem,
    importWeekdayRoutine,
    importDayPlan,
    busy,
    actionError,
    lastResult,
    clearActionError: () => setErrorNote(null),
    clearLastResult: () => setLastResult(null),
    language,
  };
}
