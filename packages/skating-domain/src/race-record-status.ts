import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";

import { isConfirmed } from "./race-day";
import { createRaceRecordEntryId } from "./race-record-entry-id";
import {
  planRaceRecords,
  raceEntryMatchesDesired,
  selfRosterEntry,
  type DesiredRaceRecord,
  type RaceRecordSkipReason,
} from "./race-record-sync";

/**
 * What a result row can say about the results -> records sync (design 2.a "visible state",
 * ADR-009). It is derived from `planRaceRecords` itself, never from a second mapping table, so
 * the row can only say what the sync will actually do.
 */
export type ResultSyncStatus =
  | { readonly kind: "recorded"; readonly recordDistanceId: string }
  /** Will be recorded but the record does not hold it yet (offline, or just confirmed). */
  | { readonly kind: "waiting" }
  | { readonly kind: "unmapped-distance" }
  | { readonly kind: "no-date" }
  | { readonly kind: "no-athlete" }
  | { readonly kind: "wrong-athlete" }
  | { readonly kind: "removed-from-race" }
  /** The row would be recorded, but the records could not be read, so whether it is is unknown. */
  | { readonly kind: "unknown" };

export type ResultSyncInfo = {
  /** Shown on a confirmed row; null shows nothing. */
  readonly status: ResultSyncStatus | null;
  /**
   * On an unconfirmed row: confirming it WOULD put it into the sync. Only then is the
   * "recorded on the records page after confirming" hint true.
   */
  readonly confirmHint: boolean;
};

export type ResultSyncDerivation = {
  readonly byResultId: ReadonlyMap<string, ResultSyncInfo>;
  /**
   * Rows that should never be in this state (an unreadable time, a missing race). They show
   * nothing; the caller logs them for developers.
   */
  readonly unexpected: readonly { readonly resultId: string; readonly reason: RaceRecordSkipReason }[];
};

/** One stored `race_` entry as read from the records documents. Values are whatever was stored. */
export type StoredRaceEntry = Readonly<Record<string, unknown>>;

const NOTHING: ResultSyncInfo = { status: null, confirmHint: false };

function planFor(
  event: Pick<RaceEvent, "eventId" | "name" | "dates">,
  races: readonly RaceEntry[],
  roster: readonly RaceRosterEntry[],
  results: readonly RaceResult[],
  athleteId: string,
) {
  return planRaceRecords({
    athleteId,
    sources: {
      events: [{ event, races, roster, results, complete: true }],
      eventsComplete: true,
      unknownEventIds: [],
    },
  });
}

/**
 * Status of every row of ONE event for the athlete who is active now.
 *
 * - Only the self row is a sync subject; rows of other people get nothing.
 * - A self row that points at no athlete, or at another athlete, is reported from the plan's
 *   skipped reasons ("not-linked" -> no-athlete, "wrong-athlete" -> wrong-athlete). Like the
 *   other reasons, a confirmed finished row shows it; an unconfirmed row shows no sync line.
 * - A self row that is no longer on the race's roster shows "removed-from-race". The result
 *   itself stays in the list (history); it just does not count toward the records.
 * - `recorded` is the entries found in the active athlete's records, or null while they are not
 *   known. A row that would be recorded must not pass for "recorded" or "waiting" on a guess, and
 *   the two ways of not knowing are told apart:
 *   - still loading (`recorded` null, `recordsReadFailed` false): the row shows nothing, since
 *     the answer is on its way;
 *   - the read failed (`recordsReadFailed` true): the row says "unknown", because nothing is
 *     coming and silence would look the same as "no sync needed".
 *   Reasons that do not depend on the records (unmapped distance, no date, no athlete, wrong
 *   athlete, removed from the race) are shown either way and are never replaced by "unknown".
 */
export function deriveResultSyncInfo(input: {
  event: Pick<RaceEvent, "eventId" | "name" | "dates">;
  races: readonly RaceEntry[];
  roster: readonly RaceRosterEntry[];
  results: readonly RaceResult[];
  athleteId: string;
  recorded: ReadonlyMap<string, StoredRaceEntry> | null;
  /** The records could not be read (as opposed to still loading). Defaults to false. */
  recordsReadFailed?: boolean;
}): ResultSyncDerivation {
  const { event, races, roster, results, athleteId, recorded, recordsReadFailed = false } = input;
  const byResultId = new Map<string, ResultSyncInfo>();
  const unexpected: { resultId: string; reason: RaceRecordSkipReason }[] = [];
  const result: ResultSyncDerivation = { byResultId, unexpected };

  const self = selfRosterEntry(roster);
  if (!self) {
    return result;
  }
  const own = results.filter((row) => row.rosterId === self.rosterId);

  const plan = planFor(event, races, roster, results, athleteId);
  const desiredByEntryId = new Map<string, DesiredRaceRecord>(plan.desired.map((entry) => [entry.entryId, entry]));
  const skippedByResultId = new Map(plan.skipped.map((skip) => [skip.resultId, skip.reason]));

  // The same plan as if every own row were confirmed: which unconfirmed rows would then sync.
  const ifConfirmed = planFor(
    event,
    races,
    roster,
    results.map((row) => (row.rosterId === self.rosterId ? { ...row, verification: "verified" as const } : row)),
    athleteId,
  );
  const wouldSync = new Set(ifConfirmed.desired.map((entry) => entry.entryId));

  for (const row of own) {
    const entryId = createRaceRecordEntryId(event.eventId, row.raceId);

    if (!isConfirmed(row)) {
      byResultId.set(row.resultId, { status: null, confirmHint: wouldSync.has(entryId) });
      continue;
    }
    // Absent from the plan's reasons: DNS / DNF / DQ, which have no time and are never synced.
    // The row already says so.
    const desired = desiredByEntryId.get(entryId);
    if (desired) {
      const stored = recorded?.get(entryId);
      let status: ResultSyncStatus | null = null;
      if (recordsReadFailed) {
        status = { kind: "unknown" };
      } else if (recorded !== null) {
        status =
          stored && raceEntryMatchesDesired(stored, desired)
            ? { kind: "recorded", recordDistanceId: desired.recordDistanceId }
            : { kind: "waiting" };
      }
      byResultId.set(row.resultId, { status, confirmHint: false });
      continue;
    }

    const reason = skippedByResultId.get(row.resultId);
    if (reason === "unmapped-distance" || reason === "no-date") {
      byResultId.set(row.resultId, { status: { kind: reason }, confirmHint: false });
    } else if (reason === "not-linked" || reason === "wrong-athlete") {
      // The plan reports a link problem for every own row, DNS / DNF / DQ included; those rows
      // have no time to record and never showed a sync line, so they still do not.
      if (row.status === "finished") {
        byResultId.set(row.resultId, {
          status: { kind: reason === "not-linked" ? "no-athlete" : "wrong-athlete" },
          confirmHint: false,
        });
      }
    } else if (reason === "removed-from-race") {
      byResultId.set(row.resultId, { status: { kind: "removed-from-race" }, confirmHint: false });
    } else if (reason === "invalid-time" || reason === "race-missing") {
      unexpected.push({ resultId: row.resultId, reason });
      byResultId.set(row.resultId, NOTHING);
    }
  }
  return result;
}
