import { setPlanFocus } from "@skatingx/firebase-client";
import { todayDateString } from "@skatingx/schema";
import { mondayOfWeek, normalizeTrainingState, type PlanFocus } from "@skatingx/skating-domain";
import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useTrainingState, useUserSettings } from "@/app/providers/FirestoreProvider";
import { requireActor } from "@/hooks/actionPrecondition";
import { logActionFailure } from "@/shared/utils/logActionFailure";

/** Shared with the analysis hub so ignoring a suggestion in either place hides it in both. */
export const HIDDEN_FEEDBACK_KEY = "skatingx.plan.feedback.hidden";

export function readHiddenFeedback(): Set<string> {
  try {
    const raw = sessionStorage.getItem(HIDDEN_FEEDBACK_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeHiddenFeedback(hidden: ReadonlySet<string>) {
  try {
    sessionStorage.setItem(HIDDEN_FEEDBACK_KEY, JSON.stringify([...hidden]));
  } catch (error) {
    logActionFailure("training-plan", "hide-suggestion", error);
  }
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
  const athleteId = settings?.activeAthleteId ?? "lindsay";

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
