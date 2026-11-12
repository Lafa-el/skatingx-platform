import type { AcademyItem, AcademyLanguage, AcademyStage } from "@skatingx/content";
import { flattenStageAndSharedItems, localizeAcademyItem } from "@skatingx/content";
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

/**
 * Legacy-aligned fuzzy match: routine label string → academy item.
 * Three passes, strongest first. Each pass walks this stage's drills first, then the shared ones.
 * A weak keyword must not win just because its drill is listed before the exact title.
 */
export function matchRoutineTaskLabel(
  stage: AcademyStage,
  taskLabel: string,
): AcademyItem | null {
  const items = flattenStageAndSharedItems(stage);
  const taskNameShort = taskLabel.split(" ")[0] ?? taskLabel;
  const cleanTask = taskLabel.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
  const cleanTaskShort = taskNameShort.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
  const keywords = taskLabel
    .split(/[/+、，()（）\s]/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length >= 2);
  const firstThreeZh = taskLabel.match(/[\u4e00-\u9fa5]{3}/);

  const passes: ((item: AcademyItem) => boolean)[] = [
    (item) => {
      const cleanItem = item.titleZh.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
      return (
        cleanItem.includes(cleanTask) ||
        cleanTask.includes(cleanItem) ||
        Boolean(cleanTaskShort && cleanItem.includes(cleanTaskShort))
      );
    },
    (item) => keywords.some((keyword) => item.titleZh.includes(keyword) || item.titleEn.includes(keyword)),
    (item) => Boolean(firstThreeZh && item.titleZh.includes(firstThreeZh[0])),
  ];

  for (const matches of passes) {
    const hit = items.find(matches);
    if (hit) return hit;
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
  // Two labels can match the same drill (the matcher is fuzzy by design), and the "already
  // imported today" check only sees tasks that exist before this batch. `seen` makes the first
  // candidate win and counts the rest as skipped, as the plan-side filter does.
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (
      hasAcademyItemImportedToday(todayTasks, candidate.academyItemId) ||
      seen.has(candidate.academyItemId)
    ) {
      skipped += 1;
      continue;
    }
    seen.add(candidate.academyItemId);
    toImport.push(candidate);
  }
  return { toImport, skipped };
}
