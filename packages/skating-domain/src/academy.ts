import type { AcademyItem, AcademyLanguage, AcademyStage } from "@skatingx/content";
import { flattenStageItems, localizeAcademyItem } from "@skatingx/content";
import type { TrainingTask } from "@skatingx/schema";

import { createTaskId } from "./tasks";

export type AcademyImportCandidate = {
  academyItemId: string;
  text: string;
  target?: string;
  description?: string;
  tags: string[];
};

export function hasAcademyItemImportedToday(
  tasks: TrainingTask[],
  academyItemId: string,
): boolean {
  return tasks.some(
    (t) => t.source === "academy" && t.academyItemId === academyItemId,
  );
}

export function buildAcademyImportCandidate(
  item: AcademyItem,
  language: AcademyLanguage,
): AcademyImportCandidate {
  const localized = localizeAcademyItem(item, language);
  return {
    academyItemId: item.id,
    text: localized.title,
    target: localized.target || undefined,
    description: localized.description || undefined,
    tags: localized.tags,
  };
}

/** Legacy-aligned fuzzy match: routine label string → academy item. */
export function matchRoutineTaskLabel(
  stage: AcademyStage,
  taskLabel: string,
): AcademyItem | null {
  const items = flattenStageItems(stage);
  const taskNameShort = taskLabel.split(" ")[0] ?? taskLabel;

  for (const item of items) {
    const cleanItem = item.titleZh.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
    const cleanTask = taskLabel.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
    const cleanTaskShort = taskNameShort.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");

    if (
      cleanItem.includes(cleanTask) ||
      cleanTask.includes(cleanItem) ||
      (cleanTaskShort && cleanItem.includes(cleanTaskShort))
    ) {
      return item;
    }

    const keywords = taskLabel
      .split(/[/+、，()（）\s]/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 2);
    if (keywords.some((kw) => item.titleZh.includes(kw) || item.titleEn.includes(kw))) {
      return item;
    }

    const firstThreeZh = taskLabel.match(/[\u4e00-\u9fa5]{3}/);
    if (firstThreeZh && item.titleZh.includes(firstThreeZh[0])) {
      return item;
    }
  }

  return null;
}

export function buildTaskFromAcademyCandidate(
  candidate: AcademyImportCandidate,
  existingIds: Set<string>,
  nowIso: string,
): TrainingTask {
  return {
    id: createTaskId(existingIds),
    text: candidate.text,
    ...(candidate.target ? { target: candidate.target } : {}),
    ...(candidate.description ? { description: candidate.description } : {}),
    source: "academy",
    academyItemId: candidate.academyItemId,
    tags: candidate.tags.length > 0 ? [...candidate.tags] : undefined,
    completed: false,
    createdAt: nowIso,
  };
}

export function filterNewAcademyCandidates(
  todayTasks: TrainingTask[],
  candidates: AcademyImportCandidate[],
): { toImport: AcademyImportCandidate[]; skipped: number } {
  let skipped = 0;
  const toImport: AcademyImportCandidate[] = [];
  for (const candidate of candidates) {
    if (hasAcademyItemImportedToday(todayTasks, candidate.academyItemId)) {
      skipped += 1;
      continue;
    }
    toImport.push(candidate);
  }
  return { toImport, skipped };
}
