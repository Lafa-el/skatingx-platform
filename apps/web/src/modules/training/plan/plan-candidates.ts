import {
  flattenStageAndSharedItems,
  getAcademyStage,
  getWeekdayRoutineItems,
  type AcademyItemCategory,
  type AcademyStage,
  type WeekdayKey,
} from "@skatingx/content";
import {
  resolveRoutineModuleLink,
  type PlanFocus,
  type PlanTaskCandidate,
} from "@skatingx/skating-domain";

import { localized } from "@/shared/i18n/localized";
import { tPlan } from "@/shared/i18n/plan-messages";
import type { Locale } from "@/shared/i18n/translator";

import { PLAN_FOCUS_SHAPE, PLAN_SURFACE_LABEL } from "./plan-shape";

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

/** A date-only string is not parsed by `new Date`. */
function weekdayKeyFor(dateId: string): WeekdayKey {
  const [year = 0, month = 1, day = 1] = dateId.split("-").map(Number);
  return WEEKDAY_BY_INDEX[new Date(year, month - 1, day).getDay()] ?? "monday";
}

function surfaceFor(category: AcademyItemCategory | null): "on-ice" | "land" | "recovery" {
  if (category === "ice") return "on-ice";
  if (category === "recovery") return "recovery";
  return "land";
}

/** Category of a reviewed link, including a shared drill. Missing ids stay uncategorised. */
export function linkedItemCategory(stage: AcademyStage, linkedId: string): AcademyItemCategory | null {
  return flattenStageAndSharedItems(stage).find((item) => item.id === linkedId)?.category ?? null;
}

/**
 * Every stage reads its own weekly routine. A missing stage, including no birth date, generates nothing.
 * Wednesday and Sunday are recovery days, so they are shown and not generated.
 */
export function planCandidatesForStage(
  stageId: string | null,
  focus: PlanFocus,
  dateId: string,
  locale: Locale,
): PlanTaskCandidate[] {
  if (!stageId) return [];
  const stage = getAcademyStage(stageId);
  if (!stage) return [];
  const weekday = weekdayKeyFor(dateId);
  if (PLAN_FOCUS_SHAPE[focus][weekday].surface === "recovery") return [];
  const order = PLAN_FOCUS_CATEGORY_ORDER[focus];
  const ranked = getWeekdayRoutineItems(stage, weekday).map((item, index) => {
    const linked = resolveRoutineModuleLink(item.routineItemId);
    const category = linked ? linkedItemCategory(stage, linked) : null;
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
