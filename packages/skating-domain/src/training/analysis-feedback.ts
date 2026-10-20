import type { PlanFocus } from "./plan-template";

/**
 * Phase 1.5, DR-005 option D. Finding codes already stored on a saved analysis
 * become a suggestion. Nothing here writes, and an unreadable frame is not advice.
 */

export const FEEDBACK_SOURCE_KINDS = ["pace", "biomech", "equipment"] as const;

export type FeedbackSourceKind = (typeof FEEDBACK_SOURCE_KINDS)[number];

export type FeedbackSource = {
  readonly kind: FeedbackSourceKind;
  readonly id: string;
  readonly createdAt: string;
  readonly findings: readonly { readonly code: string }[];
};

export type TrainingFeedback =
  | {
      readonly type: "set-focus";
      readonly focus: Extract<PlanFocus, "bounce" | "lean">;
      readonly sourceKind: "pace" | "biomech";
      readonly analysisId: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "review-equipment";
      readonly sourceKind: "equipment";
      readonly analysisId: string;
      readonly createdAt: string;
    };

const PACE_CODES = new Set(["pace.decay.back-half", "pace.total.versus-benchmark"]);
const BIOMECH_ADVICE_CODES = new Set(["biomech.knee.high", "biomech.lean.high", "biomech.pelvis.high"]);

function savedAt(createdAt: string): number | null {
  const value = Date.parse(createdAt);
  return Number.isNaN(value) ? null : value;
}

/** One latest document per kind. A newer `createdAt` replaces the older one. */
export function latestFeedbackSourceByKind(
  sources: readonly FeedbackSource[],
): Partial<Record<FeedbackSourceKind, FeedbackSource>> {
  const latest: Partial<Record<FeedbackSourceKind, FeedbackSource>> = {};
  for (const source of sources) {
    if (source.id.length === 0) continue;
    const time = savedAt(source.createdAt);
    if (time === null) continue;
    const current = latest[source.kind];
    if (!current) {
      latest[source.kind] = source;
      continue;
    }
    const currentTime = savedAt(current.createdAt) ?? Number.NEGATIVE_INFINITY;
    if (time > currentTime || (time === currentTime && source.id > current.id)) {
      latest[source.kind] = source;
    }
  }
  return latest;
}

function hasCode(source: FeedbackSource, codes: ReadonlySet<string>): boolean {
  return source.findings.some((finding) => codes.has(finding.code));
}

function hasEquipmentSymptom(source: FeedbackSource): boolean {
  return source.findings.some((finding) => finding.code.startsWith("equipment.symptom."));
}

/**
 * Suggestions from the latest pace record, the latest biomechanics record, and
 * the latest equipment record. Older records of the same kind do not contribute.
 */
export function deriveTrainingFeedback(sources: readonly FeedbackSource[]): readonly TrainingFeedback[] {
  const latest = latestFeedbackSourceByKind(sources);
  const cards: TrainingFeedback[] = [];
  const pace = latest.pace;
  if (pace && hasCode(pace, PACE_CODES)) {
    cards.push({
      type: "set-focus",
      focus: "bounce",
      sourceKind: "pace",
      analysisId: pace.id,
      createdAt: pace.createdAt,
    });
  }
  const biomech = latest.biomech;
  if (biomech && hasCode(biomech, BIOMECH_ADVICE_CODES)) {
    cards.push({
      type: "set-focus",
      focus: "lean",
      sourceKind: "biomech",
      analysisId: biomech.id,
      createdAt: biomech.createdAt,
    });
  }
  const equipment = latest.equipment;
  if (equipment && hasEquipmentSymptom(equipment)) {
    cards.push({
      type: "review-equipment",
      sourceKind: "equipment",
      analysisId: equipment.id,
      createdAt: equipment.createdAt,
    });
  }
  return cards;
}

export function trainingFeedbackKey(feedback: TrainingFeedback): string {
  return `${feedback.type}:${feedback.sourceKind}:${feedback.analysisId}`;
}
