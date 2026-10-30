import { isValidRaceDayId } from "./race-day-id";

/**
 * The deep link from a Race Day video record to the analysis page (ADR-010).
 *
 * It depends only on `race-day-id`, so the analysis page can recognise the link without pulling the
 * rest of Race Day into its bundle.
 */
export const RACE_VIDEO_PARAM = "raceVideo";
export const ANALYSIS_BIOMECHANICS_PATH = "/analysis/biomechanics";

export type RaceVideoLink = {
  readonly eventId: string;
  readonly videoId: string;
};

/**
 * `{eventId}.{videoId}`. Ids hold lowercase letters, digits and hyphens only, so one dot splits
 * them back unambiguously. The link carries no name, URL or athlete data.
 *
 * `null` for an id that could not be parsed back, so a list never throws while rendering; the
 * caller then shows no entry for that record.
 */
export function raceVideoAnalysisHref(eventId: string, videoId: string): string | null {
  if (!isValidRaceDayId(eventId) || !isValidRaceDayId(videoId)) return null;
  const value = `${eventId}.${videoId}`;
  return `${ANALYSIS_BIOMECHANICS_PATH}?${RACE_VIDEO_PARAM}=${value}`;
}

/**
 * The parameter is untrusted: anyone can type any value. Anything that is not exactly two valid ids
 * joined by one dot is `null`, and the caller then shows no banner.
 */
export function parseRaceVideoLink(raw: string | null | undefined): RaceVideoLink | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [eventId, videoId] = parts as [string, string];
  if (!isValidRaceDayId(eventId) || !isValidRaceDayId(videoId)) return null;
  return { eventId, videoId };
}
