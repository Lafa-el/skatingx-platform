import {
  deriveTrainingFeedback,
  trainingFeedbackKey,
  type FeedbackSource,
  type AnalysisTrainingFeedback,
  type PaceDistance,
  type PlanFocus,
} from "@skatingx/skating-domain";

/**
 * View model for the analysis hub. It does not read or write.
 * A missing decay stays missing: it is not zero, and the stability index is not copied into it.
 * The pace card headline is the rating and the stability index, with the stored total, benchmark total
 * and training emphasis beside them (each `null` when that record has none). Decay is a separate line,
 * present only when that record stored a number.
 * Delta and sparkline exist only when that kind has at least two finite numbers.
 * Pace trends are kept per race distance: 500m, 777m and 1000m times are not comparable. A pace
 * record without a distance (saved before the field existed) is in no trend.
 */

export const HUB_SPARK_LIMIT = 8;
export const HUB_RECENT_LIMIT = 5;
/** The order the pace trend lines are shown in. */
export const HUB_PACE_DISTANCES = ["500", "777", "1000"] as const satisfies readonly PaceDistance[];

export type HubPaceRating = "excellent" | "needs-work" | "moderate";

export type HubLaneStatus = "loading" | "error" | "ready";

export type HubLane<T> =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly records: readonly T[] };

export type HubAnalysisInput = {
  readonly kind: "pace" | "biomech";
  readonly id: string;
  readonly createdAt: string;
  /** Pace only; `null` when the record has no (or an unknown) distance. */
  readonly distance: PaceDistance | null;
  readonly findings: readonly { readonly code: string }[];
  readonly avgKnee: number | null;
  readonly avgLean: number | null;
  /**
   * Biomechanics only: how many saved frames were readable. Absent or null = not known, which is never
   * treated as zero (only an explicit 0 marks a record as having no readable frames).
   */
  readonly readableFrames?: number | null;
  readonly decayPercent: number | null;
  readonly stabilityIndexPercent: number | null;
  readonly rating: HubPaceRating | null;
  /** Pace only: what the writer stored. `null` for a record that has none of them (saved before, or malformed). */
  readonly totalSeconds: number | null;
  readonly benchmarkTotalSeconds: number | null;
  readonly trainingEmphasisRatio: string | null;
};

export type HubEquipmentInput = {
  readonly id: string;
  readonly createdAt: string;
  readonly symptomKey: string;
  readonly symptomText: string;
  readonly findings: readonly { readonly code: string }[];
};

export type NumericSeries =
  | { readonly kind: "empty" }
  | { readonly kind: "single"; readonly latest: number | null }
  | {
      readonly kind: "trend";
      readonly latest: number | null;
      readonly delta: number | null;
      readonly spark: readonly number[];
    };

export type HubMetric = {
  readonly latest: number | null;
  readonly delta: number | null;
  readonly spark: readonly number[];
};

export type HubAngleCard =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "empty" }
  | {
      readonly status: "single";
      readonly createdAt: string;
      readonly avgLean: number | null;
      readonly avgKnee: number | null;
      /** True only when the latest record explicitly has zero readable frames. */
      readonly noReadableFrames: boolean;
    }
  | {
      readonly status: "trend";
      readonly createdAt: string;
      readonly lean: HubMetric;
      readonly knee: HubMetric;
      /** True only when the latest record explicitly has zero readable frames. */
      readonly noReadableFrames: boolean;
    };

export type HubPaceDecay = {
  readonly distance: PaceDistance;
  readonly latest: number;
  readonly delta: number | null;
  readonly spark: readonly number[];
};

export type HubPaceCard =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "empty" }
  | {
      readonly status: "single";
      readonly createdAt: string;
      readonly rating: HubPaceRating | null;
      readonly stabilityIndexPercent: number | null;
      readonly totalSeconds: number | null;
      readonly benchmarkTotalSeconds: number | null;
      readonly trainingEmphasisRatio: string | null;
      /** One trend line per distance that has a stored decay, in 500 / 777 / 1000 order. */
      readonly decays: readonly HubPaceDecay[];
    }
  | {
      readonly status: "trend";
      readonly createdAt: string;
      readonly rating: HubPaceRating | null;
      readonly stabilityIndexPercent: number | null;
      readonly totalSeconds: number | null;
      readonly benchmarkTotalSeconds: number | null;
      readonly trainingEmphasisRatio: string | null;
      readonly decays: readonly HubPaceDecay[];
    };

export type HubEquipmentCard =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "empty" }
  | {
      readonly status: "ready";
      readonly createdAt: string;
      readonly symptomKey: string;
      readonly symptomText: string;
    };

export type HubSuggestion =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "none" }
  | { readonly status: "ready"; readonly feedback: AnalysisTrainingFeedback };

export type HubRecentItem =
  | {
      readonly kind: "biomech";
      readonly id: string;
      readonly createdAt: string;
      readonly avgLean: number | null;
      readonly avgKnee: number | null;
      readonly noReadableFrames: boolean;
    }
  | {
      readonly kind: "pace";
      readonly id: string;
      readonly createdAt: string;
      readonly decayPercent: number | null;
      readonly stabilityIndexPercent: number | null;
      readonly rating: HubPaceRating | null;
      /** Only the total feeds the list title; the benchmark and the ratio are card lines. */
      readonly totalSeconds: number | null;
    }
  | {
      readonly kind: "equipment";
      readonly id: string;
      readonly createdAt: string;
      readonly symptomKey: string;
      readonly symptomText: string;
    };

export type HubRecent =
  | { readonly status: "loading" }
  | { readonly status: "empty" }
  | { readonly status: "ready"; readonly items: readonly HubRecentItem[] }
  | {
      readonly status: "error";
      readonly items: readonly HubRecentItem[];
      readonly failed: readonly ("analyses" | "equipment")[];
    };

export type HubTool =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "empty" }
  | { readonly status: "ready"; readonly createdAt: string; readonly item: HubRecentItem };

export type HubModel = {
  readonly suggestion: HubSuggestion;
  readonly biomech: HubAngleCard;
  readonly pace: HubPaceCard;
  readonly equipment: HubEquipmentCard;
  readonly tools: {
    readonly biomech: HubTool;
    readonly pace: HubTool;
    readonly equipment: HubTool;
  };
  readonly recent: HubRecent;
};

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasNoReadableFrames(row: HubAnalysisInput): boolean {
  return row.readableFrames === 0;
}

function savedAt(createdAt: string): number {
  const value = Date.parse(createdAt);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

function byNewest<T extends { readonly id: string; readonly createdAt: string }>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => {
    const delta = savedAt(b.createdAt) - savedAt(a.createdAt);
    if (delta !== 0) return delta;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}

/**
 * `newestFirst` is one kind of record, newest at index 0.
 * Zero records is empty. One record is the value only. Two or more is a trend:
 * delta is latest minus the one before it, and only when both are finite numbers.
 * The sparkline ends at the latest value and does not cross a gap: it is the unbroken run of finite
 * numbers from the latest backwards (within the newest eight), oldest on the left. With the latest
 * value missing, or fewer than two points in the run, there is no line. So it is drawn exactly when
 * delta exists, and a gap never joins two points that are not neighbours.
 */
export function numericSeries(newestFirst: readonly (number | null)[]): NumericSeries {
  if (newestFirst.length === 0) return { kind: "empty" };
  const latest = finite(newestFirst[0]);
  if (newestFirst.length === 1) return { kind: "single", latest };
  const previous = finite(newestFirst[1]);
  const delta = latest !== null && previous !== null ? latest - previous : null;
  const recent = newestFirst.slice(0, HUB_SPARK_LIMIT).map((value) => finite(value));
  const firstGap = recent.indexOf(null);
  const run = (firstGap === -1 ? recent : recent.slice(0, firstGap)) as number[];
  const spark = run.reverse();
  return { kind: "trend", latest, delta, spark: spark.length >= 2 ? spark : [] };
}

function metricFrom(series: NumericSeries): HubMetric {
  if (series.kind === "trend") {
    return { latest: series.latest, delta: series.delta, spark: series.spark };
  }
  return { latest: series.kind === "single" ? series.latest : null, delta: null, spark: [] };
}

function feedbackOf(
  analyses: readonly HubAnalysisInput[],
  equipment: readonly HubEquipmentInput[],
): FeedbackSource[] {
  return [
    ...analyses.map((row) => ({
      kind: row.kind,
      id: row.id,
      createdAt: row.createdAt,
      findings: row.findings,
    })),
    ...equipment.map((row) => ({
      kind: "equipment" as const,
      id: row.id,
      createdAt: row.createdAt,
      findings: row.findings,
      symptomKey: row.symptomKey,
    })),
  ];
}

function visibleFeedback(
  sources: readonly FeedbackSource[],
  hidden: ReadonlySet<string>,
  currentFocus: PlanFocus | null,
): AnalysisTrainingFeedback[] {
  return deriveTrainingFeedback(sources, currentFocus).filter((item) => !hidden.has(trainingFeedbackKey(item)));
}

function suggestionOf(
  analyses: HubLane<HubAnalysisInput>,
  equipment: HubLane<HubEquipmentInput>,
  hidden: ReadonlySet<string>,
  currentFocus: PlanFocus | null,
): HubSuggestion {
  if (analyses.status === "loading") return { status: "loading" };
  if (analyses.status === "error") return { status: "error" };
  const leading = visibleFeedback(feedbackOf(analyses.records, []), hidden, currentFocus)[0];
  if (leading) return { status: "ready", feedback: leading };
  if (equipment.status === "loading") return { status: "loading" };
  if (equipment.status === "error") return { status: "error" };
  const first = visibleFeedback(feedbackOf(analyses.records, equipment.records), hidden, currentFocus)[0];
  return first ? { status: "ready", feedback: first } : { status: "none" };
}

function angleCard(lane: HubLane<HubAnalysisInput>): HubAngleCard {
  if (lane.status === "loading") return { status: "loading" };
  if (lane.status === "error") return { status: "error" };
  const rows = byNewest(lane.records.filter((row) => row.kind === "biomech"));
  if (rows.length === 0) return { status: "empty" };
  const latest = rows[0];
  if (!latest) return { status: "empty" };
  if (rows.length === 1) {
    return {
      status: "single",
      createdAt: latest.createdAt,
      avgLean: finite(latest.avgLean),
      avgKnee: finite(latest.avgKnee),
      noReadableFrames: hasNoReadableFrames(latest),
    };
  }
  return {
    status: "trend",
    createdAt: latest.createdAt,
    lean: metricFrom(numericSeries(rows.map((row) => row.avgLean))),
    knee: metricFrom(numericSeries(rows.map((row) => row.avgKnee))),
    noReadableFrames: hasNoReadableFrames(latest),
  };
}

/** `rows` is one distance, newest first. */
function paceDecay(distance: PaceDistance, rows: readonly HubAnalysisInput[]): HubPaceDecay | null {
  const latest = finite(rows[0]?.decayPercent);
  if (latest === null) return null;
  const series = numericSeries(rows.map((row) => row.decayPercent));
  return {
    distance,
    latest,
    delta: series.kind === "trend" ? series.delta : null,
    spark: series.kind === "trend" ? series.spark : [],
  };
}

function paceCard(lane: HubLane<HubAnalysisInput>): HubPaceCard {
  if (lane.status === "loading") return { status: "loading" };
  if (lane.status === "error") return { status: "error" };
  const rows = byNewest(lane.records.filter((row) => row.kind === "pace"));
  if (rows.length === 0) return { status: "empty" };
  const latest = rows[0];
  if (!latest) return { status: "empty" };
  const headline = {
    createdAt: latest.createdAt,
    rating: latest.rating,
    stabilityIndexPercent: finite(latest.stabilityIndexPercent),
    totalSeconds: finite(latest.totalSeconds),
    benchmarkTotalSeconds: finite(latest.benchmarkTotalSeconds),
    trainingEmphasisRatio: latest.trainingEmphasisRatio ?? null,
    decays: HUB_PACE_DISTANCES.flatMap((distance) => {
      const decay = paceDecay(
        distance,
        rows.filter((row) => row.distance === distance),
      );
      return decay ? [decay] : [];
    }),
  };
  return rows.length === 1 ? { status: "single", ...headline } : { status: "trend", ...headline };
}

function equipmentCard(lane: HubLane<HubEquipmentInput>): HubEquipmentCard {
  if (lane.status === "loading") return { status: "loading" };
  if (lane.status === "error") return { status: "error" };
  const latest = byNewest(lane.records)[0];
  if (!latest) return { status: "empty" };
  return {
    status: "ready",
    createdAt: latest.createdAt,
    symptomKey: latest.symptomKey,
    symptomText: latest.symptomText,
  };
}

function biomechItem(row: HubAnalysisInput): HubRecentItem {
  return {
    kind: "biomech",
    id: row.id,
    createdAt: row.createdAt,
    avgLean: finite(row.avgLean),
    avgKnee: finite(row.avgKnee),
    noReadableFrames: hasNoReadableFrames(row),
  };
}

function paceItem(row: HubAnalysisInput): HubRecentItem {
  return {
    kind: "pace",
    id: row.id,
    createdAt: row.createdAt,
    decayPercent: finite(row.decayPercent),
    stabilityIndexPercent: finite(row.stabilityIndexPercent),
    rating: row.rating,
    totalSeconds: finite(row.totalSeconds),
  };
}

function equipmentItem(row: HubEquipmentInput): HubRecentItem {
  return {
    kind: "equipment",
    id: row.id,
    createdAt: row.createdAt,
    symptomKey: row.symptomKey,
    symptomText: row.symptomText,
  };
}

function recentOf(analyses: HubLane<HubAnalysisInput>, equipment: HubLane<HubEquipmentInput>): HubRecent {
  if (analyses.status === "loading" || equipment.status === "loading") return { status: "loading" };
  const failed: ("analyses" | "equipment")[] = [];
  const items: HubRecentItem[] = [];
  if (analyses.status === "error") {
    failed.push("analyses");
  } else {
    for (const row of analyses.records) {
      items.push(row.kind === "biomech" ? biomechItem(row) : paceItem(row));
    }
  }
  if (equipment.status === "error") {
    failed.push("equipment");
  } else {
    for (const row of equipment.records) items.push(equipmentItem(row));
  }
  const sorted = byNewest(items).slice(0, HUB_RECENT_LIMIT);
  if (failed.length > 0) return { status: "error", items: sorted, failed };
  if (sorted.length === 0) return { status: "empty" };
  return { status: "ready", items: sorted };
}

function toolFromAngle(card: HubAngleCard, item: HubRecentItem | null): HubTool {
  if (card.status === "loading" || card.status === "error" || card.status === "empty") return { status: card.status };
  if (!item || item.kind !== "biomech") return { status: "empty" };
  return { status: "ready", createdAt: card.createdAt, item };
}

function toolFromPace(card: HubPaceCard, item: HubRecentItem | null): HubTool {
  if (card.status === "loading" || card.status === "error" || card.status === "empty") return { status: card.status };
  if (!item || item.kind !== "pace") return { status: "empty" };
  return { status: "ready", createdAt: card.createdAt, item };
}

function toolFromEquipment(card: HubEquipmentCard, item: HubRecentItem | null): HubTool {
  if (card.status === "loading" || card.status === "error" || card.status === "empty") return { status: card.status };
  if (!item || item.kind !== "equipment") return { status: "empty" };
  return { status: "ready", createdAt: card.createdAt, item };
}

export function buildHubModel(input: {
  readonly analyses: HubLane<HubAnalysisInput>;
  readonly equipment: HubLane<HubEquipmentInput>;
  readonly hidden: ReadonlySet<string>;
  /** This week's plan focus. Omitted or null = none set, nothing is filtered out. */
  readonly currentFocus?: PlanFocus | null;
}): HubModel {
  const biomech = angleCard(input.analyses);
  const pace = paceCard(input.analyses);
  const equipment = equipmentCard(input.equipment);
  const newestBiomech =
    input.analyses.status === "ready"
      ? byNewest(input.analyses.records.filter((row) => row.kind === "biomech"))[0]
      : undefined;
  const newestPace =
    input.analyses.status === "ready"
      ? byNewest(input.analyses.records.filter((row) => row.kind === "pace"))[0]
      : undefined;
  const newestEquipment = input.equipment.status === "ready" ? byNewest(input.equipment.records)[0] : undefined;
  return {
    suggestion: suggestionOf(input.analyses, input.equipment, input.hidden, input.currentFocus ?? null),
    biomech,
    pace,
    equipment,
    tools: {
      biomech: toolFromAngle(biomech, newestBiomech ? biomechItem(newestBiomech) : null),
      pace: toolFromPace(pace, newestPace ? paceItem(newestPace) : null),
      equipment: toolFromEquipment(equipment, newestEquipment ? equipmentItem(newestEquipment) : null),
    },
    recent: recentOf(input.analyses, input.equipment),
  };
}
