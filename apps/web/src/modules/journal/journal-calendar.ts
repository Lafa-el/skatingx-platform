import type { JournalDayRecord, JournalReflection, JournalSessionRecord } from "@skatingx/firebase-client";
import { isRealDateString } from "@skatingx/skating-domain";

/** What a calendar cell shows. A diary wins over a session on the same day. */
export type JournalDayMark = "journal" | "session" | "none";

export type JournalMonth = {
  readonly year: number;
  readonly month: number;
};

export type JournalDayDetail = {
  date?: string;
  location?: string;
  dayType?: string;
  overallFeeling?: number;
  energy?: number;
  soreness?: string;
  trainingFocus?: string;
  coachFeedback?: string;
  parentNote?: string;
  lindsayReflection?: JournalReflection;
  sessions: readonly { sessionLabel: string }[];
};

export function shiftJournalMonth(month: JournalMonth, delta: number): JournalMonth {
  const index = month.year * 12 + (month.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Monday-first grid. Blank cells pad the month out to whole weeks. */
export function journalMonthCells(month: JournalMonth): readonly (string | null)[] {
  const last = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const mm = String(month.month).padStart(2, "0");
  const leading = (new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay() + 6) % 7;
  const days = Array.from({ length: last }, (_, index) => {
    const date = `${String(month.year)}-${mm}-${String(index + 1).padStart(2, "0")}`;
    return isRealDateString(date) ? date : null;
  });
  const cells: (string | null)[] = [...Array<string | null>(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function journalDayMark(
  date: string,
  days: readonly { date: string }[],
  sessions: readonly { date: string }[],
): JournalDayMark {
  if (days.some((day) => day.date === date)) return "journal";
  if (sessions.some((session) => session.date === date)) return "session";
  return "none";
}

/**
 * The one document for this date. A date-id document wins over a migrated source id,
 * so a day written here is the one later edits update.
 */
export function journalDayForDate(days: readonly JournalDayRecord[], date: string): JournalDayRecord | null {
  const matches = days.filter((day) => day.date === date);
  return matches.find((day) => day.id === date) ?? matches[0] ?? null;
}

const DETAIL_KEYS = [
  "date",
  "location",
  "dayType",
  "overallFeeling",
  "energy",
  "soreness",
  "trainingFocus",
  "coachFeedback",
  "parentNote",
] as const;

/**
 * Only fields that are present. Missing optionals are omitted, never filled with a default.
 * Sessions for the day are listed only when they have a label.
 */
export function mapJournalDayDetail(
  day: JournalDayRecord | null,
  sessions: readonly JournalSessionRecord[],
  date: string,
): JournalDayDetail {
  const detail: JournalDayDetail = {
    sessions: sessions.flatMap((session) =>
      session.date === date && session.sessionLabel !== undefined ? [{ sessionLabel: session.sessionLabel }] : [],
    ),
  };
  if (!day) return detail;
  for (const key of DETAIL_KEYS) {
    const value = day[key];
    if (value !== undefined) {
      // Each key's type is the same on the record and the detail.
      Object.assign(detail, { [key]: value });
    }
  }
  if (day.lindsayReflection !== undefined) detail.lindsayReflection = day.lindsayReflection;
  return detail;
}
