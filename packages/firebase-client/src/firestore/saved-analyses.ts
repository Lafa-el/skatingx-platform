import { aggregateKeyframes, type FeedbackSource, type PoseKeyframeSample } from "@skatingx/skating-domain";
import { getDoc, onSnapshot, orderBy, query, type Firestore, type Unsubscribe } from "firebase/firestore";

import { analysesCollectionRef, analysisRecordRef } from "./refs";

export type SavedPaceRating = "excellent" | "needs-work" | "moderate";
export type SavedPaceDistance = "500" | "777" | "1000";

export type SavedAnalysisSource = FeedbackSource & {
  readonly kind: "pace" | "biomech";
  /**
   * Race distance of a pace document. `null` for biomechanics, and for a pace document saved before
   * the field existed or holding a value outside the three distances (an unknown distance, not an
   * error: the row stays).
   */
  readonly distance: SavedPaceDistance | null;
  /**
   * Set on a biomechanics document. Averages and the readable-frame count use the same rule as the tool
   * (`aggregateKeyframes`). `readableFrames` is derived on read, never stored; it is what a "no readable
   * frames" mark has to test, rather than inferring it from two empty averages.
   */
  readonly biomech: {
    readonly avgKnee: number | null;
    readonly avgLean: number | null;
    readonly readableFrames: number;
  } | null;
  /**
   * Set on a pace document. `decayPercent` is present only when the saved document
   * already stores that number. The stability index is returned under its own name.
   * `totalSeconds`, `benchmarkTotalSeconds` and `trainingEmphasisRatio` are what the writer stored
   * (the rules require all three); each is `null` when the document lacks it or holds a value of the
   * wrong shape. The ratio is the stored string as is (1 to 16 characters, as the rules allow).
   */
  readonly pace: {
    readonly decayPercent: number | null;
    readonly stabilityIndexPercent: number | null;
    readonly rating: SavedPaceRating | null;
    readonly totalSeconds: number | null;
    readonly benchmarkTotalSeconds: number | null;
    readonly trainingEmphasisRatio: string | null;
  } | null;
  /** Set on a biomechanics document that was saved from the video library. Pace documents never carry it. */
  readonly videoId?: string;
};

/** One stored pose frame, in the same shape the sampling tool saved. */
export type SavedAnalysisFrame = {
  readonly timeSeconds: number;
  readonly kneeAngle: number | null;
  readonly leanAngle: number | null;
  /** Stored hip-mid y percent. The field name stays `pelvisHeightRatio` on the document. */
  readonly pelvisHeight: number | null;
  readonly supportSide: "left" | "right" | "unknown";
  readonly supportConfidence: number | null;
  readonly readable: boolean;
  /** Stored reason text, when the frame was not readable. */
  readonly unreadableReason: string | null;
  readonly manual: boolean;
};

export type SavedAnalysisDetail = SavedAnalysisSource & {
  readonly frames: readonly SavedAnalysisFrame[];
};

const PACE_RATINGS = new Set<SavedPaceRating>(["excellent", "needs-work", "moderate"]);
const PACE_DISTANCES = new Set<SavedPaceDistance>(["500", "777", "1000"]);

function paceDistance(value: unknown): SavedPaceDistance | null {
  return typeof value === "string" && PACE_DISTANCES.has(value as SavedPaceDistance)
    ? (value as SavedPaceDistance)
    : null;
}

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
  const timeSeconds = finiteNumber(row.timeSeconds);
  if (timeSeconds === null) return null;
  const support = row.supportLeg && typeof row.supportLeg === "object" ? (row.supportLeg as Record<string, unknown>) : null;
  return {
    timeSeconds,
    readable: row.readable === true,
    unreadableReason: typeof row.unreadableReason === "string" ? (row.unreadableReason as PoseKeyframeSample["unreadableReason"]) : null,
    kneeAngle: finiteNumber(row.kneeAngleDegrees),
    leanAngle: finiteNumber(row.leanAngleDegrees),
    pelvisHeight: finiteNumber(row.pelvisHeightRatio),
    recoveryRate: finiteNumber(row.recoveryRate),
    supportSide:
      support?.side === "left" || support?.side === "right" || support?.side === "unknown"
        ? support.side
        : "unknown",
    supportConfidence: finiteNumber(support?.confidencePercent),
    manual: support?.manual === true,
    issue: null,
  };
}

function poseFramesOf(data: Record<string, unknown>): SavedAnalysisFrame[] {
  if (!Array.isArray(data.poseFrames)) return [];
  return data.poseFrames.flatMap((frame) => {
    const sample = frameToSample(frame);
    if (!sample) return [];
    return [
      {
        timeSeconds: sample.timeSeconds,
        kneeAngle: sample.kneeAngle,
        leanAngle: sample.leanAngle,
        pelvisHeight: sample.pelvisHeight,
        supportSide: sample.supportSide,
        supportConfidence: sample.supportConfidence,
        readable: sample.readable,
        unreadableReason: sample.unreadableReason,
        manual: sample.manual,
      },
    ];
  });
}

function biomechAverages(frames: unknown): NonNullable<SavedAnalysisSource["biomech"]> {
  const samples = Array.isArray(frames) ? frames.flatMap((frame) => {
    const sample = frameToSample(frame);
    return sample ? [sample] : [];
  }) : [];
  const aggregate = aggregateKeyframes(samples);
  return { avgKnee: aggregate.avgKnee, avgLean: aggregate.avgLean, readableFrames: aggregate.readable };
}

function paceDetail(pace: unknown): NonNullable<SavedAnalysisSource["pace"]> {
  if (!pace || typeof pace !== "object") {
    return {
      decayPercent: null,
      stabilityIndexPercent: null,
      rating: null,
      totalSeconds: null,
      benchmarkTotalSeconds: null,
      trainingEmphasisRatio: null,
    };
  }
  const row = pace as Record<string, unknown>;
  const rating = typeof row.rating === "string" && PACE_RATINGS.has(row.rating as SavedPaceRating)
    ? (row.rating as SavedPaceRating)
    : null;
  return {
    decayPercent: finiteNumber(row.decayPercent),
    stabilityIndexPercent: finiteNumber(row.stabilityIndexPercent),
    rating,
    totalSeconds: finiteNumber(row.totalSeconds),
    benchmarkTotalSeconds: finiteNumber(row.benchmarkTotalSeconds),
    trainingEmphasisRatio:
      typeof row.trainingEmphasisRatio === "string" &&
      row.trainingEmphasisRatio.length >= 1 &&
      row.trainingEmphasisRatio.length <= 16
        ? row.trainingEmphasisRatio
        : null,
  };
}

/**
 * One saved analysis, by id. Missing and malformed documents are both `null`.
 * This reads that document only; it does not subscribe to the collection.
 */
export async function getSavedAnalysis(
  db: Firestore,
  userId: string,
  id: string,
): Promise<SavedAnalysisDetail | null> {
  const snapshot = await getDoc(analysisRecordRef(db, userId, id));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (!data) return null;
  const source = savedAnalysisFromDocument(snapshot.id, data);
  if (!source) return null;
  return { ...source, frames: poseFramesOf(data) };
}

/** Same query as before. Extra fields are read off the document that is already loaded. */
export function savedAnalysisFromDocument(docId: string, data: Record<string, unknown>): SavedAnalysisSource | null {
  if (typeof data.createdAt !== "string") return null;
  const hasPace = data.pace != null;
  const hasBiomech = data.poseFrames != null;
  const kind: SavedAnalysisSource["kind"] | null = hasPace && !hasBiomech ? "pace" : hasBiomech && !hasPace ? "biomech" : null;
  if (!kind) return null;
  const id = typeof data.id === "string" && data.id.length > 0 ? data.id : docId;
  const videoId = kind === "biomech" ? libraryVideoId(data.videoId) : undefined;
  return {
    kind,
    id,
    distance: kind === "pace" ? paceDistance(data.distance) : null,
    createdAt: data.createdAt,
    findings: findingCodes(data.findings),
    biomech: kind === "biomech" ? biomechAverages(data.poseFrames) : null,
    pace: kind === "pace" ? paceDetail(data.pace) : null,
    ...(videoId ? { videoId } : {}),
  };
}

function libraryVideoId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const videoId = value.trim();
  return videoId.length > 0 ? videoId : undefined;
}

/**
 * Read the saved pace and biomechanics documents for one athlete. This does not write.
 * The caller unsubscribes when the page goes away.
 *
 * The collection is user-level, so the query stays `orderBy(createdAt)`. Documents whose
 * `athleteId` is not the one asked for are left out here, and they are not counted as
 * dropped. A `where` on `athleteId` plus that order would need a composite index.
 *
 * `dropped` counts the documents of this snapshot that were left out whole (no string `createdAt`, or
 * not exactly one of pace / poseFrames). It is worked out again for every snapshot, never summed over
 * time, and it does not count fields that were normalised while the record was kept. It exists so a
 * caller can tell "no records" from "records that could not be read".
 */
export function subscribeToSavedAnalyses(
  db: Firestore,
  userId: string,
  athleteId: string,
  onData: (sources: readonly SavedAnalysisSource[], dropped: number) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const saved = query(analysesCollectionRef(db, userId), orderBy("createdAt", "desc"));
  return onSnapshot(
    saved,
    (snapshot) => {
      const sources: SavedAnalysisSource[] = [];
      let dropped = 0;
      for (const entry of snapshot.docs) {
        const data = entry.data();
        if (data.athleteId !== athleteId) continue;
        const source = savedAnalysisFromDocument(entry.id, data);
        if (source) sources.push(source);
        else dropped += 1;
      }
      onData(sources, dropped);
    },
    onError,
  );
}
