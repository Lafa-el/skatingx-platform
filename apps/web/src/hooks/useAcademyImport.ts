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
import { localized } from "@/shared/i18n/localized";
import type { Locale } from "@/shared/i18n/translator";

/**
 * What the user is told when an import fails. It keeps what happened, not the sentence, so it
 * follows the language if it changes afterwards. A message that came from the data layer is shown
 * as it arrived.
 */
type ImportErrorNote = { failed: true } | { received: string };

/**
 * A routine label that matches no drill becomes a plain task. The split into a name and a target
 * (the part after the last space, such as "3组") is a convention of the Chinese labels, so it and
 * the id always come from the Chinese label: the id then stays the same in both languages and
 * "already added today" keeps working after a language change. English shows the whole English
 * label instead of cutting it at a space.
 */
function fallbackCandidate(
  language: Locale,
  label: { zh: string; en: string },
  idFor: (name: string) => string,
): AcademyImportCandidate {
  const parts = label.zh.split(" ");
  const target = parts.length > 1 ? parts.pop() : "";
  const name = parts.join(" ").trim() || label.zh;
  const academyItemId = idFor(name);
  const tags = ["academy-routine"];
  return localized<AcademyImportCandidate>(language, {
    zh: { academyItemId, text: name, target: target || undefined, tags },
    en: { academyItemId, text: label.en, tags },
  });
}

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
        // Matching is done on the Chinese label in both languages.
        const matched = matchRoutineTaskLabel(stage, routineItem.taskLabelZh);
        if (matched) {
          candidates.push(buildAcademyImportCandidate(matched, language));
        } else {
          candidates.push(
            fallbackCandidate(
              language,
              { zh: routineItem.taskLabelZh, en: routineItem.taskLabelEn },
              () => `routine-fallback-${routineItem.routineItemId}`,
            ),
          );
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
      for (const [index, taskLabelZh] of plan.taskLabelsZh.entries()) {
        const matched = matchRoutineTaskLabel(stage, taskLabelZh);
        if (matched) {
          candidates.push(buildAcademyImportCandidate(matched, language));
        } else {
          candidates.push(
            fallbackCandidate(
              language,
              // The content test guarantees both lists have the same length.
              { zh: taskLabelZh, en: plan.taskLabelsEn[index] ?? taskLabelZh },
              (name) => `plan-fallback-${plan.id}-${name}`,
            ),
          );
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
