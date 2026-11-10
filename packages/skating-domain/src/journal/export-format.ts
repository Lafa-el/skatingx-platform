import { addDaysToDateString } from "../training/plan-progress";
import { isRealDateString } from "../calendar-date";
import { mondayOfWeek } from "../training/plan-tasks";

/**
 * What a journal export keeps. Pure: the reader fills these arrays, and this file only
 * filters and formats them. A video has no `date`, so its day is the first 10 characters of `createdAt`.
 */
export type JournalExportBundle = {
  days: readonly { date: string }[];
  sessions: readonly { date: string }[];
  coachNotes: readonly { date: string }[];
  bodyStatus: readonly { date: string }[];
  weeklyReviews: readonly { weekStart: string }[];
  videos: readonly { createdAt: string }[];
};

export type ExportScope =
  | { kind: "all" }
  | { kind: "range"; from: string; to: string }
  | { kind: "week"; weekStart: string };

export type ExportScopeInput =
  | { kind: "all" }
  | { kind: "range"; from: string; to: string }
  | { kind: "week"; day: string };

/**
 * A range needs two real dates with `from` on or before `to`. A week accepts any real day and
 * keeps the Monday of that week. Anything else is refused, and nothing is downloaded.
 */
export function prepareExportScope(input: ExportScopeInput): { ok: true; scope: ExportScope } | { ok: false } {
  if (input.kind === "all") return { ok: true, scope: input };
  if (input.kind === "range") {
    if (!isRealDateString(input.from) || !isRealDateString(input.to) || input.from > input.to) return { ok: false };
    return { ok: true, scope: { kind: "range", from: input.from, to: input.to } };
  }
  if (!isRealDateString(input.day)) return { ok: false };
  return { ok: true, scope: { kind: "week", weekStart: mondayOfWeek(input.day) } };
}

function bounds(scope: Exclude<ExportScope, { kind: "all" }>): { from: string; to: string } {
  if (scope.kind === "range") return { from: scope.from, to: scope.to };
  return { from: scope.weekStart, to: addDaysToDateString(scope.weekStart, 6) };
}

function inClosedRange(value: string, from: string, to: string): boolean {
  return value >= from && value <= to;
}

/** Dated rows use `date`. A weekly review uses `weekStart`. A video uses the date part of `createdAt`. */
export function filterExportByScope<T extends JournalExportBundle>(data: T, scope: ExportScope): T {
  if (scope.kind === "all") return data;
  const { from, to } = bounds(scope);
  return {
    ...data,
    days: data.days.filter((row) => inClosedRange(row.date, from, to)),
    sessions: data.sessions.filter((row) => inClosedRange(row.date, from, to)),
    coachNotes: data.coachNotes.filter((row) => inClosedRange(row.date, from, to)),
    bodyStatus: data.bodyStatus.filter((row) => inClosedRange(row.date, from, to)),
    weeklyReviews: data.weeklyReviews.filter((row) =>
      scope.kind === "week" ? row.weekStart === scope.weekStart : inClosedRange(row.weekStart, from, to),
    ),
    videos: data.videos.filter((row) => inClosedRange(row.createdAt.slice(0, 10), from, to)),
  };
}

/** One JSON file. The records are the parsed rows, unchanged. */
export function buildExportJson(data: JournalExportBundle, exportedAt: string): string {
  return JSON.stringify(
    {
      exportedAt,
      days: data.days,
      sessions: data.sessions,
      coachNotes: data.coachNotes,
      bodyStatus: data.bodyStatus,
      weeklyReviews: data.weeklyReviews,
      videos: data.videos,
    },
    null,
    2,
  );
}

function cellText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** RFC 4180: a comma, quote, or line break is wrapped, and a quote inside is doubled. */
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/**
 * One collection, one CSV. The header is the union of every row's keys, in the order each key
 * is first seen, so a key that appears only on a later row is not dropped. An empty collection
 * is an empty string and the card skips that file.
 */
export function buildCollectionCsv(rows: readonly object[]): string {
  if (rows.length === 0) return "";
  const headers: string[] = [];
  const seen = new Set<string>();
  const records = rows.map((row) => row as Record<string, unknown>);
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (seen.has(key)) continue;
      seen.add(key);
      headers.push(key);
    }
  }
  const lines = [headers.map((key) => escapeCell(key)).join(",")];
  for (const record of records) {
    lines.push(headers.map((key) => escapeCell(cellText(record[key]))).join(","));
  }
  return lines.join("\r\n");
}
