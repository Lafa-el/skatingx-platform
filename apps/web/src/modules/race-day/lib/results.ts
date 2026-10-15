import type { RaceEntry, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import {
  createRaceResultId,
  formatResultTime,
  isValidRaceDayId,
  sortRaceEntries,
  type RaceResultFormInput,
} from "@skatingx/skating-domain";

/** A result joined with what it refers to, for display. */
export type ResultView = {
  result: RaceResult;
  /** Null when the race no longer exists (should not happen: deleting a race deletes its results). */
  race: RaceEntry | null;
  /** Position in the whole schedule, the same "#n" the Schedule tab shows. */
  raceNumber: number | null;
  athlete: RaceRosterEntry | null;
  /**
   * False when the athlete was taken off this race's list after the result was entered. The
   * result is kept and shown with a note, never hidden or deleted along with that change.
   */
  athleteInRace: boolean;
};

/**
 * Newest change first, so a result that was just entered or edited is at the top of the feed.
 * Ties keep a stable order by id.
 */
export function buildResultViews(
  results: readonly RaceResult[],
  races: readonly RaceEntry[],
  roster: readonly RaceRosterEntry[],
): ResultView[] {
  const raceById = new Map(races.map((race) => [race.raceId, race]));
  const athleteById = new Map(roster.map((entry) => [entry.rosterId, entry]));
  const numberById = new Map<string, number>();
  sortRaceEntries(races).forEach((race, index) => numberById.set(race.raceId, index + 1));

  return results
    .map((result): ResultView => {
      const race = raceById.get(result.raceId) ?? null;
      return {
        result,
        race,
        raceNumber: numberById.get(result.raceId) ?? null,
        athlete: athleteById.get(result.rosterId) ?? null,
        athleteInRace: race?.rosterIds.includes(result.rosterId) ?? false,
      };
    })
    .sort((a, b) => {
      const byTime = Date.parse(b.result.updatedAt ?? "") - Date.parse(a.result.updatedAt ?? "");
      return byTime !== 0 && !Number.isNaN(byTime) ? byTime : a.result.resultId.localeCompare(b.result.resultId);
    });
}

/** The id the repository would use, or null while no race or no athlete is chosen. */
export function resultIdFor(raceId: string, rosterId: string): string | null {
  // Ids come from stored documents and are valid; checking first avoids a throw for an odd one.
  return isValidRaceDayId(raceId) && isValidRaceDayId(rosterId) ? createRaceResultId(raceId, rosterId) : null;
}

export type AdvancedChoice = "" | "yes" | "no";

export type ResultFormValues = {
  status: string;
  time: string;
  place: string;
  advanced: AdvancedChoice;
  sourceNote: string;
};

export const EMPTY_RESULT_FORM: ResultFormValues = {
  status: "finished",
  time: "",
  place: "",
  advanced: "",
  sourceNote: "",
};

/** Form values for editing: the time is shown the way it can be typed back in. */
export function resultToFormValues(result: RaceResult | undefined): ResultFormValues {
  if (!result) {
    return EMPTY_RESULT_FORM;
  }
  return {
    status: result.status,
    time: result.timeSeconds === null ? "" : formatResultTime(result.timeSeconds),
    place: result.place === null ? "" : String(result.place),
    advanced: result.advanced === null ? "" : result.advanced ? "yes" : "no",
    sourceNote: result.sourceNote,
  };
}

/** Only a finished race has a time, place or advancement; the form hides them otherwise. */
export function formValuesToInput(values: ResultFormValues): RaceResultFormInput {
  const finished = values.status === "finished";
  return {
    status: values.status,
    time: finished ? values.time : "",
    place: finished ? values.place : "",
    advanced: finished ? (values.advanced === "yes" ? true : values.advanced === "no" ? false : null) : null,
    sourceNote: values.sourceNote,
  };
}
