/**
 * Applies the production pose-frame definition to spike landmarks.
 * Knee, lean, and pelvis use legacy-pose.ts. Pose 0.5 is the baseline.
 * Drawn joint coordinates are an extra reference, not a skating ground truth.
 */

import {
  calculateAngle,
  emptySupportTracker,
  emptyTrackingState,
  interpretPoseFrame,
  leanAngleDegrees,
  pelvisHeightPercent,
} from "../../../packages/skating-domain/src/analysis/legacy-pose.ts";

const BODY_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function round(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pelvisNumber(metrics) {
  if (!metrics.pelvisDisplay || metrics.pelvisDisplay.startsWith("--")) return null;
  const value = Number(metrics.pelvisDisplay.replace("%", ""));
  return Number.isFinite(value) ? value : null;
}

function asLandmarks(input) {
  if (!input || input.length !== 33) return null;
  if (!input.some((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  return input.map((point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return { x: point.x, y: point.y, visibility: point.visibility };
  });
}

export function runProductionMetrics(frameLandmarks) {
  let tracking = emptyTrackingState();
  let support = emptySupportTracker();
  return frameLandmarks.map((input) => {
    const landmarks = asLandmarks(input);
    const result = interpretPoseFrame(tracking, support, { landmarks, keyframePending: false });
    tracking = result.tracking;
    support = result.support;
    return {
      readable: result.metrics.readable,
      unreadableReason: result.metrics.unreadableReason,
      kneeAngle: result.metrics.kneeAngle,
      leanAngle: result.metrics.leanAngle,
      pelvisPercent: pelvisNumber(result.metrics),
      kneeDisplay: result.metrics.kneeDisplay,
      leanDisplay: result.metrics.leanDisplay,
      pelvisDisplay: result.metrics.pelvisDisplay,
    };
  });
}

function geometric(landmarks) {
  const points = asLandmarks(landmarks);
  if (!points) return null;
  const needed = [11, 12, 23, 24, 25, 26, 27, 28];
  if (!needed.every((index) => points[index])) return null;
  const leftKnee = calculateAngle(points[23], points[25], points[27]);
  const rightKnee = calculateAngle(points[24], points[26], points[28]);
  const lean = leanAngleDegrees(points);
  const pelvis = pelvisHeightPercent(points);
  if (lean === null || pelvis === null) return null;
  return {
    leftKnee,
    rightKnee,
    kneeAngle: Math.min(leftKnee, rightKnee),
    leanAngle: lean,
    pelvisPercent: Number(pelvis),
  };
}

function distance(a, b, indices) {
  if (!a || !b) return null;
  const values = [];
  for (const index of indices) {
    if (!a[index] || !b[index]) return null;
    values.push(Math.hypot(a[index].x - b[index].x, a[index].y - b[index].y));
  }
  return mean(values);
}

function nearestFigure(landmarks, figures) {
  if (!figures?.length) return null;
  let best = null;
  for (const figure of figures) {
    const body = distance(landmarks, figure, BODY_INDICES);
    if (body === null) continue;
    if (!best || body < best.body) best = { figure, body };
  }
  return best;
}

function pairedMae(left, right, key) {
  const deltas = [];
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]?.[key];
    const b = right[i]?.[key];
    if (typeof a === "number" && typeof b === "number") deltas.push(Math.abs(a - b));
  }
  return { frames: deltas.length, mae: round(mean(deltas), 3) };
}

function timingStats(frames) {
  const values = frames.map((frame) => frame.inferenceMs).filter((value) => typeof value === "number");
  return {
    frames: values.length,
    firstMs: round(values[0] ?? null, 1),
    meanMs: round(mean(values), 1),
    medianMs: round(median(values), 1),
    impliedFps: values.length ? round(1000 / mean(values), 2) : null,
  };
}

function clipComparison(clip, engineFrames, baselineFrames) {
  const modelMetrics = runProductionMetrics(engineFrames.map((frame) => frame.landmarks));
  const baselineMetrics = baselineFrames
    ? runProductionMetrics(baselineFrames.map((frame) => frame.landmarks))
    : null;
  const drawnKnee = [];
  const drawnLean = [];
  const drawnPelvis = [];
  const bodyDistances = [];
  let detected = 0;
  let falseReadable = 0;
  clip.frames.forEach((frame, index) => {
    const landmarks = asLandmarks(engineFrames[index]?.landmarks ?? null);
    if (landmarks) detected += 1;
    const nearest = nearestFigure(landmarks, frame.figures);
    if (!frame.figures.length && modelMetrics[index]?.readable) falseReadable += 1;
    if (!nearest) return;
    bodyDistances.push(nearest.body);
    const drawn = geometric(nearest.figure);
    const found = geometric(landmarks);
    if (!drawn || !found) return;
    drawnKnee.push(Math.abs(found.kneeAngle - drawn.kneeAngle));
    drawnLean.push(Math.abs(found.leanAngle - drawn.leanAngle));
    drawnPelvis.push(Math.abs(found.pelvisPercent - drawn.pelvisPercent));
  });
  return {
    frames: clip.frames.length,
    detectedFrames: detected,
    readableFrames: modelMetrics.filter((metrics) => metrics.readable).length,
    falseReadableFrames: falseReadable,
    productionVersusPose05: baselineMetrics
      ? {
          knee: pairedMae(modelMetrics, baselineMetrics, "kneeAngle"),
          lean: pairedMae(modelMetrics, baselineMetrics, "leanAngle"),
          pelvis: pairedMae(modelMetrics, baselineMetrics, "pelvisPercent"),
          bothReadable: modelMetrics.filter((metrics, index) => metrics.readable && baselineMetrics[index]?.readable)
            .length,
        }
      : null,
    versusDrawnFigure: {
      bodyLandmarkMae: round(mean(bodyDistances), 4),
      bodyFrames: bodyDistances.length,
      kneeMae: round(mean(drawnKnee), 3),
      leanMae: round(mean(drawnLean), 3),
      pelvisMae: round(mean(drawnPelvis), 3),
      geometricFrames: drawnKnee.length,
    },
    production: modelMetrics,
  };
}

export function drawnClipPreview(manifest, clipId) {
  const clip = manifest.clips.find((item) => item.id === clipId);
  if (!clip) throw new Error(`missing-clip ${clipId}`);
  return runProductionMetrics(clip.frames.map((frame) => frame.figures[0] ?? null));
}

function normalBodyError(engines, name) {
  return engines[name]?.clips["fx-normal"]?.versusDrawnFigure?.bodyLandmarkMae ?? null;
}

export function recommendTier(engines) {
  const poseError = normalBodyError(engines, "pose05");
  const heavyError = normalBodyError(engines, "heavy");
  const heavyDetected = engines.heavy?.clips["fx-normal"]?.detectedFrames ?? 0;
  if (heavyDetected < 3 || heavyError === null) {
    return {
      tier: "stay-on-pose-0.5",
      reason:
        "The synthetic normal clip did not give heavy enough detections to rank tiers. This is not evidence that Landmarker loses on real skating video.",
    };
  }
  const ranked = ["lite", "full", "heavy"]
    .map((tier) => ({ tier, error: normalBodyError(engines, tier) }))
    .filter((item) => item.error !== null)
    .sort((a, b) => a.error - b.error);
  const best = ranked[0];
  const heavyBeatsPose = poseError === null || heavyError <= poseError + 0.005;
  const lighterWins =
    best !== undefined && best.tier !== "heavy" && best.error + 0.02 < heavyError;
  if (!heavyBeatsPose && lighterWins && best.error + 0.005 < poseError) {
    return {
      tier: best.tier,
      reason: `${best.tier} was closer to the drawn mannequin than Pose 0.5 and heavy on fx-normal. Heavy remains the plan default when the gap is under 0.02.`,
    };
  }
  if (!heavyBeatsPose) {
    return {
      tier: "stay-on-pose-0.5",
      reason:
        "On this synthetic batch, heavy's body-landmark error was higher than Pose 0.5. The plan says the Landmarker family does not replace 0.5 in that case. The figures are mannequins, so this is not a skating-video verdict.",
    };
  }
  if (lighterWins) {
    return {
      tier: best.tier,
      reason: `${best.tier} matched the drawn mannequin by more than 0.02 normalized distance better than heavy on fx-normal. That gap is why this batch does not keep the heavy default.`,
    };
  }
  return {
    tier: "heavy",
    reason:
      "Heavy is the accuracy-first default. On fx-normal it matched the drawn mannequin as well as Pose 0.5, or better, and no lighter tier beat it by more than 0.02. The real-device speed gate is not decided here.",
  };
}

export function summarize(raw, manifest) {
  const clipsById = new Map(manifest.clips.map((clip) => [clip.id, clip]));
  const engines = {};
  for (const [name, engine] of Object.entries(raw.engines)) {
    const clips = {};
    for (const [clipId, frames] of Object.entries(engine.clips)) {
      const clip = clipsById.get(clipId);
      const baseline = name === "pose05" ? null : raw.engines.pose05?.clips[clipId];
      clips[clipId] = clipComparison(clip, frames, baseline);
    }
    engines[name] = {
      delegate: engine.delegate,
      wasm: engine.wasm ?? null,
      gpuFallback: engine.gpuFallback,
      loadMs: round(engine.loadMs, 1),
      clips,
      timing: Object.fromEntries(
        Object.entries(engine.clips).map(([clipId, frames]) => [clipId, timingStats(frames)]),
      ),
    };
  }
  const recommendation = recommendTier(engines);
  return {
    recommendation,
    engines,
  };
}
