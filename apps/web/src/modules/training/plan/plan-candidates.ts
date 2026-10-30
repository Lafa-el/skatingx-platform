import { planDayIdFor, type PlanFocus, type PlanTaskCandidate } from "@skatingx/skating-domain";

import type { Locale } from "@/shared/i18n/translator";
import { tPlan } from "@/shared/i18n/plan-messages";

import { dayEntries, PLAN_SURFACE_LABEL } from "./plan-day-entries";

/**
 * Today's plan tasks as strings, for `generatePlanTasksIfNeeded`. The transaction does not know
 * about i18n keys, so the language is fixed here, at generation time: a task keeps the language it
 * was written in, the same as an Academy import. Rest-day entries (`generate: false`) are left out.
 */
export function planCandidatesFor(focus: PlanFocus, dateId: string, locale: Locale): PlanTaskCandidate[] {
  return dayEntries(planDayIdFor(focus, dateId)).flatMap((entry) =>
    entry.generate === false
      ? []
      : [
          {
            planEntryId: entry.id,
            text: tPlan(locale, entry.nameKey),
            ...(entry.targetKey ? { target: tPlan(locale, entry.targetKey) } : {}),
            description: tPlan(locale, PLAN_SURFACE_LABEL[entry.surface]),
          },
        ],
  );
}
