/**
 * Build-time feature flags. Vite inlines `VITE_*` values, so changing one needs a rebuild
 * (on Vercel: set the variable, then redeploy). They are client configuration, not secrets.
 */

/** Strict: only the text "true" (any case, surrounding spaces ignored) turns a flag on. */
export function parseFeatureFlag(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

/** Race Day Companion (ADR-001 D3). Off by default: the app is unchanged when unset. */
export function isRaceDayEnabled(): boolean {
  return parseFeatureFlag(import.meta.env.VITE_FEATURE_RACE_DAY);
}
