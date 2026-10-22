import type { PlanFocus } from "@skatingx/skating-domain";
import { useState } from "react";

import { logActionFailure } from "@/shared/utils/logActionFailure";

/** Shared with the analysis hub so ignoring a suggestion in either place hides it in both. */
export const HIDDEN_FEEDBACK_KEY = "skatingx.plan.feedback.hidden";

/** Shared with the analysis hub so Accept runs the same set-focus as the plan page. */
export const PLAN_FOCUS_KEY = "skatingx.plan.focus";

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

export function readPlanFocus(): PlanFocus | null {
  try {
    const raw = sessionStorage.getItem(PLAN_FOCUS_KEY);
    if (raw === "lean" || raw === "bounce" || raw === "endurance") return raw;
    return null;
  } catch {
    return null;
  }
}

function writePlanFocus(focus: PlanFocus) {
  try {
    sessionStorage.setItem(PLAN_FOCUS_KEY, focus);
  } catch (error) {
    logActionFailure("training-plan", "set-focus", error);
  }
}

/**
 * One set-focus for the plan page and the analysis hub. The week focus lives in
 * sessionStorage, same lifetime as a hidden suggestion, and is not a Firestore write.
 */
export function usePlanFocus(): readonly [PlanFocus | null, (focus: PlanFocus) => void] {
  const [focus, setFocus] = useState<PlanFocus | null>(() => readPlanFocus());
  const choose = (next: PlanFocus) => {
    writePlanFocus(next);
    setFocus(next);
  };
  return [focus, choose];
}
