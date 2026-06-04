import {
  getFirestoreDb,
  importAcademyTasks,
  type AcademyImportResult,
} from "@skatingx/firebase-client";
import type { AcademyLanguage } from "@skatingx/content";
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

export function useAcademyImport() {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AcademyImportResult | null>(null);

  const athleteId = settings?.activeAthleteId ?? "lindsay";
  const language: AcademyLanguage = settings?.language === "en" ? "en" : "zh";

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
      setActionError(null);
      try {
        const result = await importAcademyTasks(
          { db, userId: uid, athleteId },
          candidates,
        );
        setLastResult(result);
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Academy import failed.";
        setActionError(message);
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
    async (stage: AcademyStage, weekday: WeekdayKey) => {
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
    [language, runImport],
  );

  const importDayPlan = useCallback(
    async (stage: AcademyStage, dayPlanId: string) => {
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
    [language, runImport],
  );

  return {
    importItem,
    importWeekdayRoutine,
    importDayPlan,
    busy,
    actionError,
    lastResult,
    clearActionError: () => setActionError(null),
    clearLastResult: () => setLastResult(null),
    language,
  };
}
