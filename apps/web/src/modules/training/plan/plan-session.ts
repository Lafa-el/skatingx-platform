import { setPlanFocus } from "@skatingx/firebase-client";
import { DEFAULT_ATHLETE_ID, todayDateString } from "@skatingx/schema";
import { mondayOfWeek, normalizeTrainingState, type PlanFocus } from "@skatingx/skating-domain";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useTrainingState, useUserSettings } from "@/app/providers/FirestoreProvider";
import { requireActor } from "@/hooks/actionPrecondition";
import { logActionFailure } from "@/shared/utils/logActionFailure";

/** Shared with the analysis hub so ignoring a suggestion in either place hides it in both. */
export const HIDDEN_FEEDBACK_KEY = "skatingx.plan.feedback.hidden";

type StoredHiddenFeedback = {
  readonly week: string;
  readonly hidden: readonly string[];
};

function currentWeek(): string {
  return mondayOfWeek(todayDateString());
}

/**
 * Only this week's list counts. A stored earlier week, an old bare array, or unreadable JSON
 * reads as empty and is left in place; the next ignore overwrites it with this Monday.
 */
export function readHiddenFeedback(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HIDDEN_FEEDBACK_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Set();
    const record = parsed as { week?: unknown; hidden?: unknown };
    if (record.week !== currentWeek() || !Array.isArray(record.hidden)) return new Set();
    return new Set(record.hidden.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

export function writeHiddenFeedback(hidden: ReadonlySet<string>) {
  try {
    const stored: StoredHiddenFeedback = { week: currentWeek(), hidden: [...hidden] };
    window.localStorage.setItem(HIDDEN_FEEDBACK_KEY, JSON.stringify(stored));
  } catch (error) {
    logActionFailure("training-plan", "hide-suggestion", error);
  }
}

/**
 * This week's ignored suggestions. A write updates this tab at once (a same-tab storage event
 * never fires). Another tab is picked up from the storage event, then re-read so a stale week
 * still comes back empty.
 */
export function useHiddenFeedback(): readonly [ReadonlySet<string>, (next: ReadonlySet<string>) => void] {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => readHiddenFeedback());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== HIDDEN_FEEDBACK_KEY) return;
      setHidden(readHiddenFeedback());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const write = useCallback((next: ReadonlySet<string>) => {
    writeHiddenFeedback(next);
    setHidden(next);
  }, []);

  return [hidden, write];
}

export type PlanFocusStatus = {
  /** The training state has not arrived yet. Not the same as "nothing chosen". */
  readonly loading: boolean;
  /** A focus chosen in an earlier week. It generates nothing until it is confirmed again. */
  readonly staleFocus: PlanFocus | null;
  /** The last choose did not reach the cloud. */
  readonly failed: boolean;
};

/**
 * One set-focus for the plan page and the analysis hub (ADR-008). The focus is stored on
 * `training/state` with the Monday of the week it was chosen in, so it survives a closed browser and
 * is only current for that week. Reading it needs no new listener: the provider already has one.
 */
export function usePlanFocus(): readonly [PlanFocus | null, (focus: PlanFocus) => void, PlanFocusStatus] {
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const { data: raw, loading } = useTrainingState();
  const [failed, setFailed] = useState(false);
  const athleteId = settings?.activeAthleteId ?? DEFAULT_ATHLETE_ID;

  const state = raw ? normalizeTrainingState(raw) : null;
  const stored = state?.planFocus ?? null;
  const isThisWeek = state?.planFocusWeek === mondayOfWeek(todayDateString());
  const focus = stored && isThisWeek ? stored : null;
  const staleFocus = stored && !isThisWeek ? stored : null;

  const choose = useCallback(
    (next: PlanFocus) => {
      setFailed(false);
      void (async () => {
        try {
          await setPlanFocus({ ...requireActor(uid), athleteId }, next);
        } catch (error) {
          // The page says the choice was not saved; the context goes to the log.
          logActionFailure("training-plan", "set-focus", error);
          setFailed(true);
        }
      })();
    },
    [uid, athleteId],
  );

  return [focus, choose, { loading, staleFocus, failed }];
}
