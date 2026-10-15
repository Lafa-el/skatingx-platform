import type { RaceEventInput, RaceInput } from "./race-day-input";

/**
 * Starter data for a known event (ADR-001 D5, owner decision on the Buffalo template).
 *
 * A template carries only what is public and already agreed: the event name, its calendar days
 * and the list of distances. It deliberately has NO athlete name, bib or division, NO race day,
 * time, round, heat or participants, and NO time zone: those are unverified or personal, so the
 * user types them. Everything a template creates is saved as pending (待确认) like any
 * manual entry, because creation always goes through the normal pending path.
 */

export type RaceDayTemplate = {
  /** Deterministic id, so the UI can tell the template was already applied. */
  eventId: string;
  event: RaceEventInput;
  races: { raceId: string; input: RaceInput }[];
};

const TEMPLATE_NOTE = "Template: public event info, not verified";

function templateRace(
  raceId: string,
  distanceId: string,
  label: string,
  sortOrder: number,
): { raceId: string; input: RaceInput } {
  return {
    raceId,
    input: {
      distanceId,
      label,
      sortOrder,
      day: null,
      round: null,
      heat: null,
      scheduledAt: null,
      rosterIds: [],
      sourceNote: TEMPLATE_NOTE,
    },
  };
}

export const BUFFALO_2026_TEMPLATE: RaceDayTemplate = {
  eventId: "buffalo-championships-2026",
  event: {
    name: "Buffalo Championships",
    dates: ["2026-10-24", "2026-10-25"],
    timeZone: null,
    venue: null,
    sourceNote: TEMPLATE_NOTE,
  },
  // Two separate 500m races: the same distance, told apart by `sortOrder`.
  races: [
    templateRace("500m-1", "500m", "500m", 0),
    templateRace("500m-2", "500m", "500m", 1),
    templateRace("1000m", "1000m", "1000m", 2),
    templateRace("super-1500m", "super_1500m", "Super 1500m", 3),
  ],
};

export const RACE_DAY_TEMPLATES: readonly RaceDayTemplate[] = [BUFFALO_2026_TEMPLATE];
