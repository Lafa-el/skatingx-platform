import type { RaceEntry, RaceRosterEntry, RaceVideoRef } from "@skatingx/schema";
import { externalUrlHost, sortRaceEntries, type RaceVideoInput } from "@skatingx/skating-domain";

export type VideoView = {
  video: RaceVideoRef;
  /** Null when the athlete no longer exists (deleting an athlete deletes their records). */
  athlete: RaceRosterEntry | null;
  /** Host to show for the link, or null when there is no link we are willing to open. */
  linkHost: string | null;
};

export type VideoGroup = {
  /** Null for records whose race is missing; they are kept visible in a group of their own. */
  race: RaceEntry | null;
  raceNumber: number | null;
  views: VideoView[];
};

/**
 * Records grouped by race in schedule order, newest change first inside a group. Races with no
 * records are left out. A record whose race is missing is shown last rather than hidden.
 */
export function buildVideoGroups(
  videos: readonly RaceVideoRef[],
  races: readonly RaceEntry[],
  roster: readonly RaceRosterEntry[],
): VideoGroup[] {
  const athleteById = new Map(roster.map((entry) => [entry.rosterId, entry]));
  const view = (video: RaceVideoRef): VideoView => ({
    video,
    athlete: athleteById.get(video.rosterId) ?? null,
    // Re-checked here, not only on write: only a plain http(s) link is ever turned into an href.
    linkHost: video.externalUrl === null ? null : externalUrlHost(video.externalUrl),
  });
  const newestFirst = (a: RaceVideoRef, b: RaceVideoRef) => {
    const byTime = Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "");
    return byTime !== 0 && !Number.isNaN(byTime) ? byTime : a.videoId.localeCompare(b.videoId);
  };

  const raceIds = new Set(races.map((race) => race.raceId));
  const groups: VideoGroup[] = [];
  sortRaceEntries(races).forEach((race, index) => {
    const own = videos.filter((video) => video.raceId === race.raceId).sort(newestFirst);
    if (own.length > 0) {
      groups.push({ race, raceNumber: index + 1, views: own.map(view) });
    }
  });
  const orphans = videos.filter((video) => !raceIds.has(video.raceId)).sort(newestFirst);
  if (orphans.length > 0) {
    groups.push({ race: null, raceNumber: null, views: orphans.map(view) });
  }
  return groups;
}

export type VideoFormValues = {
  label: string;
  externalUrl: string;
  storedWhere: string;
  note: string;
};

export const EMPTY_VIDEO_FORM: VideoFormValues = { label: "", externalUrl: "", storedWhere: "", note: "" };

export function videoToFormValues(video: RaceVideoRef | undefined): VideoFormValues {
  return video
    ? {
        label: video.label,
        externalUrl: video.externalUrl ?? "",
        storedWhere: video.storedWhere ?? "",
        note: video.note ?? "",
      }
    : EMPTY_VIDEO_FORM;
}

/** Empty optional fields become null; the domain trims and validates the rest. */
export function formValuesToVideoInput(values: VideoFormValues): RaceVideoInput {
  return {
    label: values.label,
    externalUrl: values.externalUrl.trim() === "" ? null : values.externalUrl,
    storedWhere: values.storedWhere.trim() === "" ? null : values.storedWhere,
    note: values.note.trim() === "" ? null : values.note,
  };
}
