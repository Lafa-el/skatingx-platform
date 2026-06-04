import type { DateString, TimeEntry } from "@skatingx/schema";

const MAX_RECORD_SECONDS = 60 * 30;

function roundSeconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

function isValidRecordSeconds(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_RECORD_SECONDS;
}

/**
 * Parse time strings such as `49.8`, `0:49.80`, `1:44.23`, `2:47.00`.
 */
export function parseTimeToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes(":")) {
    const [minutePart, secondPart] = trimmed.split(":");
    const minutes = Number.parseInt(minutePart?.trim() || "0", 10);
    const seconds = Number.parseFloat(secondPart?.trim() || "0");
    if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
      return null;
    }
    const total = roundSeconds(minutes * 60 + seconds);
    return isValidRecordSeconds(total) ? total : null;
  }

  const seconds = Number.parseFloat(trimmed);
  if (Number.isNaN(seconds)) {
    return null;
  }
  const total = roundSeconds(seconds);
  return isValidRecordSeconds(total) ? total : null;
}

/** Display time for PB cards and lists (e.g. `0:49.80`, `1:44.23`). */
export function formatSecondsToTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--";
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const secondText =
    minutes > 0
      ? remainder.toFixed(2).padStart(5, "0")
      : remainder.toFixed(2);
  return minutes > 0 ? `${minutes}:${secondText}` : secondText;
}

export function normalizeDistanceId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "distance";
}

export function getBestTime(entries: TimeEntry[]): TimeEntry | null {
  if (entries.length === 0) {
    return null;
  }
  return entries.reduce((best, entry) =>
    entry.timeSeconds < best.timeSeconds ? entry : best,
  );
}

export function getLatestTime(entries: TimeEntry[]): TimeEntry | null {
  const sorted = sortRecordsByDate(entries);
  return sorted[0] ?? null;
}

/** Newest date first; same date sorts by createdAt descending. */
export function sortRecordsByDate(entries: TimeEntry[]): TimeEntry[] {
  return [...entries].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

export function normalizeTimeEntry(entry: Partial<TimeEntry>): TimeEntry {
  return {
    id: String(entry.id ?? ""),
    date: (entry.date ?? "") as DateString,
    timeSeconds: Number(entry.timeSeconds ?? 0),
    source: entry.source ?? "manual",
    createdAt: entry.createdAt ?? new Date().toISOString(),
    ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
    ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
  };
}

export function normalizeDistanceRecordsDocument(
  distanceId: string,
  label: string,
  raw: Partial<{ entries?: TimeEntry[] }> | null | undefined,
): { distanceId: string; label: string; unit: "seconds"; entries: TimeEntry[] } {
  const entries = (raw?.entries ?? [])
    .map((e) => normalizeTimeEntry(e))
    .filter((e) => e.id && e.date && e.timeSeconds > 0);
  return {
    distanceId,
    label,
    unit: "seconds",
    entries,
  };
}

export function createTimeEntryId(existingIds: Set<string>): string {
  let id: string;
  do {
    id = `time_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  } while (existingIds.has(id));
  return id;
}
