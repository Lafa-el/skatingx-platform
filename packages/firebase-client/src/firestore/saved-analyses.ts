import { aggregateKeyframes, type FeedbackSource, type PoseKeyframeSample } from "@skatingx/skating-domain";
import { onSnapshot, orderBy, query, type Firestore, type Unsubscribe } from "firebase/firestore";

import { analysesCollectionRef } from "./refs";

export type SavedPaceRating = "excellent" | "needs-work" | "moderate";

export type SavedAnalysisSource = FeedbackSource & {
  readonly kind: "pace" | "biomech";
  /** Set on a biomechanics document. Averages use the same readable-frame rule as the tool. */
  readonly biomech: { readonly avgKnee: number | null; readonly avgLean: number | null } | null;
  /**
   * Set on a pace document. `decayPercent` is present only when the saved document
   * already stores that number. The stability index is returned under its own name.
   */
  readonly pace: {
    readonly decayPercent: number | null;
    readonly stabilityIndexPercent: number | null;
    readonly rating: SavedPaceRating | null;
  } | null;
};

const PACE_RATINGS = new Set<SavedPaceRating>(["excellent", "needs-work", "moderate"]);

function findingCodes(value: unknown): { code: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("code" in item)) return [];
    const code = item.code;
    return typeof code === "string" ? [{ code }] : [];
  });
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function frameToSample(frame: unknown): PoseKeyframeSample | null {
  if (!frame || typeof frame !== "object") return null;
  const row = frame as Record<string, unknown>;
  return {
    timeSeconds: finiteNumber(row.timeSeconds) ?? 0,
    readable: row.readable === true,
    unreadableReason: null,
    kneeAngle: finiteNumber(row.kneeAngleDegrees),
    leanAngle: finiteNumber(row.leanAngleDegrees),
    pelvisHeight: null,
    recoveryRate: null,
    supportSide: "unknown",
    supportConfidence: null,
    manual: false,
    issue: null,
  };
}

function biomechAverages(frames: unknown): { avgKnee: number | null; avgLean: number | null } {
  const samples = Array.isArray(frames) ? frames.flatMap((frame) => {
    const sample = frameToSample(frame);
    return sample ? [sample] : [];
  }) : [];
  const aggregate = aggregateKeyframes(samples);
  return { avgKnee: aggregate.avgKnee, avgLean: aggregate.avgLean };
}

function paceDetail(pace: unknown): NonNullable<SavedAnalysisSource["pace"]> {
  if (!pace || typeof pace !== "object") {
    return { decayPercent: null, stabilityIndexPercent: null, rating: null };
  }
  const row = pace as Record<string, unknown>;
  const rating = typeof row.rating === "string" && PACE_RATINGS.has(row.rating as SavedPaceRating)
    ? (row.rating as SavedPaceRating)
    : null;
  return {
    decayPercent: finiteNumber(row.decayPercent),
    stabilityIndexPercent: finiteNumber(row.stabilityIndexPercent),
    rating,
  };
}

/** Same query as before. Extra fields are read off the document that is already loaded. */
export function savedAnalysisFromDocument(docId: string, data: Record<string, unknown>): SavedAnalysisSource | null {
  if (typeof data.createdAt !== "string") return null;
  const hasPace = data.pace != null;
  const hasBiomech = data.poseFrames != null;
  const kind: SavedAnalysisSource["kind"] | null = hasPace && !hasBiomech ? "pace" : hasBiomech && !hasPace ? "biomech" : null;
  if (!kind) return null;
  const id = typeof data.id === "string" && data.id.length > 0 ? data.id : docId;
  return {
    kind,
    id,
    createdAt: data.createdAt,
    findings: findingCodes(data.findings),
    biomech: kind === "biomech" ? biomechAverages(data.poseFrames) : null,
    pace: kind === "pace" ? paceDetail(data.pace) : null,
  };
}

/**
 * Read the saved pace and biomechanics documents. This does not write.
 * The caller unsubscribes when the page goes away.
 */
export function subscribeToSavedAnalyses(
  db: Firestore,
  userId: string,
  onData: (sources: readonly SavedAnalysisSource[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const saved = query(analysesCollectionRef(db, userId), orderBy("createdAt", "desc"));
  return onSnapshot(
    saved,
    (snapshot) => {
      const sources: SavedAnalysisSource[] = [];
      for (const entry of snapshot.docs) {
        const source = savedAnalysisFromDocument(entry.id, entry.data());
        if (source) sources.push(source);
      }
      onData(sources);
    },
    onError,
  );
}
