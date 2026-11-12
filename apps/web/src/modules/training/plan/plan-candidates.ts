import {
  findAcademyItem,
  getAcademyStage,
  getWeekdayRoutineItems,
  type AcademyItemCategory,
  type WeekdayKey,
} from "@skatingx/content";
import {
  planDayIdFor,
  resolveRoutineModuleLink,
  type PlanFocus,
  type PlanTaskCandidate,
} from "@skatingx/skating-domain";

import { localized } from "@/shared/i18n/localized";
import { tPlan } from "@/shared/i18n/plan-messages";
import type { Locale } from "@/shared/i18n/translator";

import { dayEntries, PLAN_SURFACE_LABEL } from "./plan-day-entries";
import { PLAN_FOCUS_SHAPE } from "./plan-shape";

/**
 * Category order for one focus. Items with no reviewed link sort after every known category,
 * and keep their routine order inside a category.
 */
export const PLAN_FOCUS_CATEGORY_ORDER: Record<PlanFocus, readonly AcademyItemCategory[]> = {
  lean: ["technique", "ice", "mobility", "dryland", "strength", "recovery"],
  bounce: ["strength", "ice", "technique", "dryland", "mobility", "recovery"],
  endurance: ["recovery", "ice", "technique", "dryland", "strength", "mobility"],
};

/** Race week stays short. The old endurance days were already three or four tasks. */
const ENDURANCE_CAP = 4;

const WEEKDAY_BY_INDEX: readonly WeekdayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Same local calendar split as `planDayIdFor`. A date-only string is not parsed by `new Date`. */
function weekdayKeyFor(dateId: string): WeekdayKey {
  const [year = 0, month = 1, day = 1] = dateId.split("-").map(Number);
  return WEEKDAY_BY_INDEX[new Date(year, month - 1, day).getDay()] ?? "monday";
}

function surfaceFor(category: AcademyItemCategory | null): "on-ice" | "land" | "recovery" {
  if (category === "ice") return "on-ice";
  if (category === "recovery") return "recovery";
  return "land";
}

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

/**
 * Age 11–13 reads that stage's weekly routine. Every other stage, including a missing profile,
 * stays on the Junior D template.
 * Wednesday and Sunday are the routine's recovery days, so they are shown and not generated.
 */
export function planCandidatesForStage(
  stageId: string | null,
  focus: PlanFocus,
  dateId: string,
  locale: Locale,
): PlanTaskCandidate[] {
  if (stageId !== "age11_13") return planCandidatesFor(focus, dateId, locale);
  const stage = getAcademyStage("age11_13");
  if (!stage) return [];
  const weekday = weekdayKeyFor(dateId);
  if (PLAN_FOCUS_SHAPE[focus][weekday].surface === "recovery") return [];
  const order = PLAN_FOCUS_CATEGORY_ORDER[focus];
  const ranked = getWeekdayRoutineItems(stage, weekday).map((item, index) => {
    const linked = resolveRoutineModuleLink(item.routineItemId);
    const category = linked ? (findAcademyItem(stage.id, linked)?.item.category ?? null) : null;
    const rank = category === null ? order.length : order.indexOf(category);
    return { item, index, category, rank: rank < 0 ? order.length : rank };
  });
  ranked.sort((left, right) => left.rank - right.rank || left.index - right.index);
  const picked = focus === "endurance" ? ranked.slice(0, ENDURANCE_CAP) : ranked;
  return picked.map(({ item, category }) => ({
    planEntryId: item.routineItemId,
    text: localized(locale, { zh: item.taskLabelZh, en: item.taskLabelEn }),
    description: tPlan(locale, PLAN_SURFACE_LABEL[surfaceFor(category)]),
  }));
}
