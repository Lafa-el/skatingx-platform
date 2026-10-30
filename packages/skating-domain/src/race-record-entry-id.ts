import { isValidRaceDayId } from "./race-day-id";

/**
 * The id of a record entry that follows a race result (ADR-009). Kept apart from the sync logic
 * so the records page can tell such entries apart without loading any Race Day code.
 */

/** Prefix of the entries this feature owns. Everything else in a records document is the user's. */
export const RACE_RECORD_ENTRY_PREFIX = "race_";

/** `race_{eventId}_{raceId}`. Both halves are slugs and "_" is not allowed inside a slug. */
export function createRaceRecordEntryId(eventId: string, raceId: string): string {
  return `${RACE_RECORD_ENTRY_PREFIX}${eventId}_${raceId}`;
}

/**
 * The inverse of `createRaceRecordEntryId`; null for any id that is not exactly that shape.
 * Such entries are never touched, so a malformed or foreign id cannot be deleted by mistake.
 */
export function parseRaceRecordEntryId(id: string): { eventId: string; raceId: string } | null {
  if (!id.startsWith(RACE_RECORD_ENTRY_PREFIX)) {
    return null;
  }
  const parts = id.slice(RACE_RECORD_ENTRY_PREFIX.length).split("_");
  const [eventId, raceId] = parts;
  if (parts.length !== 2 || !eventId || !raceId) {
    return null;
  }
  return isValidRaceDayId(eventId) && isValidRaceDayId(raceId) ? { eventId, raceId } : null;
}

/** True for entries the records page must not offer to edit or delete: they follow their result. */
export function isRaceSyncedEntryId(id: string): boolean {
  return parseRaceRecordEntryId(id) !== null;
}
