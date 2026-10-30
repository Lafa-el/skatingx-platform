import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";

import { isConfirmed } from "./race-day";
import { isRealDateString, RACE_DAY_LIMITS } from "./race-day-input";
import { createRaceRecordEntryId, parseRaceRecordEntryId } from "./race-record-entry-id";

export {
  createRaceRecordEntryId,
  isRaceSyncedEntryId,
  parseRaceRecordEntryId,
  RACE_RECORD_ENTRY_PREFIX,
} from "./race-record-entry-id";

/**
 * Race results -> training records (ADR-009). Pure planning and reconciliation; nothing here
 * reads or writes Firestore, so every rule below is testable on its own.
 */

/** Race `distanceId` -> records `distanceId`. Anything not listed is not synced (ADR-009 2.3). */
const RECORD_DISTANCE_BY_RACE_DISTANCE: Readonly<Record<string, string>> = {
  "333m": "333m",
  "500m": "500m",
  "777m": "777m",
  "1000m": "1000m",
  "1500m": "1500m",
  // Same distance as 1500m, so its times compare directly. The project name stays in `note`.
  super_1500m: "1500m",
};

export function mapRaceDistanceToRecordDistance(raceDistanceId: string): string | null {
  return Object.hasOwn(RECORD_DISTANCE_BY_RACE_DISTANCE, raceDistanceId)
    ? (RECORD_DISTANCE_BY_RACE_DISTANCE[raceDistanceId] ?? null)
    : null;
}

export type RaceRecordSourceEvent = {
  event: Pick<RaceEvent, "eventId" | "name" | "dates">;
  races: readonly RaceEntry[];
  roster: readonly RaceRosterEntry[];
  results: readonly RaceResult[];
  /**
   * True only when roster, races and results were all read, without errors or unreadable
   * documents. Only then does a missing result mean "deleted" rather than "not loaded".
   */
  complete: boolean;
};

export type RaceRecordSources = {
  events: readonly RaceRecordSourceEvent[];
  /** True only when the event list itself was read without errors or unreadable documents. */
  eventsComplete: boolean;
  /** Ids of event documents that exist but could not be read. Their entries are never removed. */
  unknownEventIds: readonly string[];
};

export type DesiredRaceRecord = {
  entryId: string;
  eventId: string;
  raceId: string;
  /** Records document: `training/main/records/{recordDistanceId}`. */
  recordDistanceId: string;
  date: string;
  timeSeconds: number;
  note: string;
};

export type RaceRecordSkipReason =
  | "not-self"
  | "not-confirmed"
  | "not-finished"
  | "invalid-time"
  | "race-missing"
  | "unmapped-distance"
  | "no-date";

export type SkippedRaceResult = { eventId: string; resultId: string; reason: RaceRecordSkipReason };

export type RaceRecordPlan = {
  desired: readonly DesiredRaceRecord[];
  skipped: readonly SkippedRaceResult[];
  /**
   * Whether a `race_` entry of this event may be removed when it is not in `desired`. False
   * whenever the absence of its source could just mean it was not read (ADR-009 2.7).
   */
  canRemoveEntriesOf(eventId: string): boolean;
};

/** The user's own roster row. Several are possible; the first by id wins, as on the summary page. */
export function selfRosterEntry(roster: readonly RaceRosterEntry[]): RaceRosterEntry | null {
  const selves = roster.filter((entry) => entry.isSelf).sort((a, b) => a.rosterId.localeCompare(b.rosterId));
  return selves[0] ?? null;
}

/**
 * The day a race was run, never guessed: the race's own day, or the event's only day. A race
 * without a day in a multi-day event is skipped rather than assigned to a day.
 */
function raceDay(race: RaceEntry, event: Pick<RaceEvent, "dates">): string | null {
  if (race.day !== null && isRealDateString(race.day)) {
    return race.day;
  }
  const days = [...new Set(event.dates.filter(isRealDateString))];
  return race.day === null && days.length === 1 ? (days[0] ?? null) : null;
}

function isRecordableTime(seconds: number | null): seconds is number {
  return seconds !== null && Number.isFinite(seconds) && seconds > 0 && seconds <= RACE_DAY_LIMITS.resultTimeMaxSeconds;
}

/**
 * Which record entries should exist for `athleteId`, given everything read from Race Day.
 * Only the athlete's own confirmed, finished, mappable results with a known day qualify.
 */
export function planRaceRecords(input: { sources: RaceRecordSources; athleteId: string }): RaceRecordPlan {
  const { sources, athleteId } = input;
  const desired = new Map<string, DesiredRaceRecord>();
  const skipped: SkippedRaceResult[] = [];

  for (const source of sources.events) {
    const self = selfRosterEntry(source.roster);
    const eventId = source.event.eventId;
    if (!self || self.athleteRefId === null || self.athleteRefId !== athleteId) {
      continue;
    }
    const racesById = new Map(source.races.map((race) => [race.raceId, race]));

    for (const result of source.results) {
      const skip = (reason: RaceRecordSkipReason) => skipped.push({ eventId, resultId: result.resultId, reason });
      if (result.rosterId !== self.rosterId) {
        continue;
      }
      if (!isConfirmed(result)) {
        skip("not-confirmed");
        continue;
      }
      if (result.status !== "finished") {
        skip("not-finished");
        continue;
      }
      if (!isRecordableTime(result.timeSeconds)) {
        skip("invalid-time");
        continue;
      }
      const race = racesById.get(result.raceId);
      if (!race) {
        skip("race-missing");
        continue;
      }
      const recordDistanceId = mapRaceDistanceToRecordDistance(race.distanceId);
      if (!recordDistanceId) {
        skip("unmapped-distance");
        continue;
      }
      const day = raceDay(race, source.event);
      if (!day) {
        skip("no-date");
        continue;
      }
      const entryId = createRaceRecordEntryId(eventId, race.raceId);
      desired.set(entryId, {
        entryId,
        eventId,
        raceId: race.raceId,
        recordDistanceId,
        date: day,
        timeSeconds: result.timeSeconds,
        note: `${source.event.name} · ${race.label}`,
      });
    }
  }

  const completeEventIds = new Set(sources.events.filter((source) => source.complete).map((s) => s.event.eventId));
  const knownEventIds = new Set(sources.events.map((source) => source.event.eventId));
  const unknown = new Set(sources.unknownEventIds);

  return {
    desired: [...desired.values()],
    skipped,
    canRemoveEntriesOf(eventId) {
      if (!sources.eventsComplete || unknown.has(eventId)) {
        return false;
      }
      // An event that is gone from a fully read list was deleted; one that is still there must
      // have been read completely before its absent results count as deleted.
      return !knownEventIds.has(eventId) || completeEventIds.has(eventId);
    },
  };
}

export type RaceRecordReconcileResult = {
  /** The whole array to store. Entries this feature does not own are passed through untouched. */
  entries: unknown[];
  added: number;
  updated: number;
  removed: number;
};

type StoredEntry = Record<string, unknown>;

function isStoredEntry(value: unknown): value is StoredEntry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function differs(stored: Readonly<StoredEntry>, desired: DesiredRaceRecord): boolean {
  return (
    stored.date !== desired.date ||
    stored.timeSeconds !== desired.timeSeconds ||
    stored.note !== desired.note ||
    stored.source !== "race"
  );
}

/**
 * True when a stored `race_` entry already holds what `desired` says. This is the same test the
 * reconcile below uses to decide whether to update, exposed so the Results page can tell
 * "recorded" from "still waiting" with the very same rule (it changes nothing about reconciling).
 */
export function raceEntryMatchesDesired(stored: Readonly<Record<string, unknown>>, desired: DesiredRaceRecord): boolean {
  return !differs(stored, desired);
}

/**
 * Brings the `race_` entries of ONE records document in line with `desired` (only the entries
 * for that document's distance). Idempotent: running it again on its own output changes nothing.
 *
 * Works on the raw stored values so an entry it does not own is returned exactly as read, even
 * when it would not pass normalization: this never rewrites or drops the user's own data.
 */
export function reconcileRaceEntries(input: {
  existing: readonly unknown[];
  desired: readonly DesiredRaceRecord[];
  canRemoveEntriesOf: (eventId: string) => boolean;
  nowIso: string;
}): RaceRecordReconcileResult {
  const desiredById = new Map(input.desired.map((record) => [record.entryId, record]));
  const seen = new Set<string>();
  const entries: unknown[] = [];
  let updated = 0;
  let removed = 0;

  for (const raw of input.existing) {
    const id = isStoredEntry(raw) && typeof raw.id === "string" ? raw.id : null;
    const parsed = id === null ? null : parseRaceRecordEntryId(id);
    if (id === null || parsed === null || !isStoredEntry(raw)) {
      entries.push(raw);
      continue;
    }
    if (seen.has(id)) {
      // A second copy of one id can only come from a past bug; the first copy is the entry.
      removed += 1;
      continue;
    }
    seen.add(id);

    const wanted = desiredById.get(id);
    if (!wanted) {
      if (input.canRemoveEntriesOf(parsed.eventId)) {
        removed += 1;
      } else {
        entries.push(raw);
      }
      continue;
    }
    if (!differs(raw, wanted)) {
      entries.push(raw);
      continue;
    }
    updated += 1;
    entries.push({
      ...raw,
      date: wanted.date,
      timeSeconds: wanted.timeSeconds,
      note: wanted.note,
      source: "race",
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : input.nowIso,
      updatedAt: input.nowIso,
    });
  }

  let added = 0;
  for (const record of input.desired) {
    if (seen.has(record.entryId)) {
      continue;
    }
    added += 1;
    entries.push({
      id: record.entryId,
      date: record.date,
      timeSeconds: record.timeSeconds,
      note: record.note,
      source: "race",
      createdAt: input.nowIso,
      updatedAt: input.nowIso,
    });
  }

  return { entries, added, updated, removed };
}
