export type NormalizedProgress = {
  value: number;
  max: number;
  /** 0 to 1, the share of the track to fill. */
  fraction: number;
};

/**
 * A bar is fed counts that can be empty (0 of 0 tasks today) or briefly wrong while data loads, so
 * anything that is not a usable number draws an empty bar rather than NaN% or an overfull one.
 */
export function normalizeProgress(value: number, max: number): NormalizedProgress {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  return { value: safeValue, max: safeMax, fraction: safeMax > 0 ? safeValue / safeMax : 0 };
}
