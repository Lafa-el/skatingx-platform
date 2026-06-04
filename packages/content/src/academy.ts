import type {
  AcademyItem,
  AcademyLanguage,
  AcademyModule,
  AcademyStage,
  WeekdayKey,
} from "./academy-types";
import { ACADEMY_STAGES } from "./academy-stages.generated";

export * from "./academy-types";
export { ACADEMY_STAGES };

export const ACADEMY_CONTENT_VERSION = "1.0.0-blaze-extract" as const;

export function getAcademyStages(): AcademyStage[] {
  return ACADEMY_STAGES;
}

export function getAcademyStage(stageId: string): AcademyStage | undefined {
  return ACADEMY_STAGES.find((s) => s.id === stageId);
}

export function findAcademyItem(
  stageId: string,
  academyItemId: string,
): { stage: AcademyStage; module: AcademyModule; item: AcademyItem } | null {
  const stage = getAcademyStage(stageId);
  if (!stage) {
    return null;
  }
  for (const module of stage.modules) {
    const item = module.items.find((i) => i.id === academyItemId);
    if (item) {
      return { stage, module, item };
    }
  }
  return null;
}

export function localizeAcademyItem(
  item: AcademyItem,
  language: AcademyLanguage,
): { title: string; description: string; target: string } {
  const isEn = language === "en";
  return {
    title: isEn ? item.titleEn : item.titleZh,
    description: isEn ? item.descriptionEn : item.descriptionZh,
    target: isEn ? item.targetEn : item.targetZh,
  };
}

export function localizeStageLabel(
  stage: AcademyStage,
  language: AcademyLanguage,
): string {
  return language === "en" ? stage.labelEn : stage.labelZh;
}

export function getWeekdayRoutineItems(
  stage: AcademyStage,
  weekday: WeekdayKey,
): AcademyStage["weeklyRoutine"]["days"][WeekdayKey] {
  return stage.weeklyRoutine.days[weekday] ?? [];
}

/** All academy items flattened for fuzzy routine matching. */
export function flattenStageItems(stage: AcademyStage): AcademyItem[] {
  return stage.modules.flatMap((m) => m.items);
}
