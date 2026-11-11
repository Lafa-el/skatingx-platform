/**
 * One camp's numbers, derived on the page and never written.
 * The window is the closed range from the camp's start date through its end date.
 *
 * `preBest` is the best time strictly before the camp starts. The old site's "best outside
 * the camp" also counted results after the camp. A later result must not become the
 * before-camp best.
 *
 * Technical issues count coach-note tags only. A session's focus tags are a different tally
 * (the weekly review mixes them) and are ignored here, even when a caller still has them.
 */

export type CampStatsDay = {
  date: string;
};

export type CampStatsSession = {
  date: string;
  sessionType?: string;
  durationMinutes?: number;
  focusTags?: readonly string[];
  technicalFocus?: string;
};

export type CampStatsNote = {
  date: string;
  technicalTags?: readonly string[];
};

export type CampStatsTimeEntry = {
  date: string;
  timeSeconds: number;
};

export type CampStatsDistance = {
  distanceId: string;
  label: string;
  entries: readonly CampStatsTimeEntry[];
};

export type CampStatsInput = {
  campStart: string;
  campEnd: string;
  days: readonly CampStatsDay[];
  sessions: readonly CampStatsSession[];
  notes: readonly CampStatsNote[];
  distances: readonly CampStatsDistance[];
  /** Known tag order. Equal counts keep this order; anything else sorts after it. */
  presetOrder: readonly string[];
};

export type CampPbChange = {
  distanceId: string;
  label: string;
  before?: number;
  after?: number;
  changed: boolean;
};

export type CampTechIssue = {
  label: string;
  count: number;
};

export type CampStats = {
  totalCampDays: number;
  trainingDays: number;
  iceCount: number;
  drylandCount: number;
  privateLessonCount: number;
  totalMinutes: number;
  totalSessions: number;
  pbChanges: CampPbChange[];
  techIssuesTop: CampTechIssue[];
};

const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function inCamp(date: string, campStart: string, campEnd: string): boolean {
  return date >= campStart && date <= campEnd;
}

/** Whole UTC days since the epoch, only for a real calendar day. `new Date(string)` is not used. */
function utcDayIndex(date: string): number | undefined {
  const match = DATE_PATTERN.exec(date);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return undefined;
  }
  return utc / MS_PER_DAY;
}

function inclusiveCampDays(campStart: string, campEnd: string): number {
  const start = utcDayIndex(campStart);
  const end = utcDayIndex(campEnd);
  if (start === undefined || end === undefined || end < start) return 0;
  return end - start + 1;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function addCount(counts: Map<string, number>, label: string) {
  const text = label.trim();
  if (text.length === 0) return;
  counts.set(text, (counts.get(text) ?? 0) + 1);
}

function bestBefore(entries: readonly CampStatsTimeEntry[], campStart: string): number | undefined {
  let best: number | undefined;
  for (const entry of entries) {
    if (!(entry.date < campStart)) continue;
    if (!positiveFinite(entry.timeSeconds)) continue;
    if (best === undefined || entry.timeSeconds < best) best = entry.timeSeconds;
  }
  return best;
}

function bestDuring(
  entries: readonly CampStatsTimeEntry[],
  campStart: string,
  campEnd: string,
): number | undefined {
  let best: number | undefined;
  for (const entry of entries) {
    if (!inCamp(entry.date, campStart, campEnd)) continue;
    if (!positiveFinite(entry.timeSeconds)) continue;
    if (best === undefined || entry.timeSeconds < best) best = entry.timeSeconds;
  }
  return best;
}

export function deriveCampStats(input: CampStatsInput): CampStats {
  const { campStart, campEnd } = input;
  const days = input.days.filter((day) => inCamp(day.date, campStart, campEnd));
  const sessions = input.sessions.filter((session) => inCamp(session.date, campStart, campEnd));
  const notes = input.notes.filter((note) => inCamp(note.date, campStart, campEnd));

  const trainingDates = new Set<string>();
  for (const day of days) trainingDates.add(day.date);
  for (const session of sessions) trainingDates.add(session.date);

  let iceCount = 0;
  let drylandCount = 0;
  let privateLessonCount = 0;
  let totalMinutes = 0;
  for (const session of sessions) {
    if (session.sessionType === "ice") iceCount += 1;
    else if (session.sessionType === "dryland") drylandCount += 1;
    else if (session.sessionType === "private_lesson") privateLessonCount += 1;
    if (positiveFinite(session.durationMinutes)) totalMinutes += session.durationMinutes;
  }

  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.technicalTags ?? []) addCount(counts, tag);
  }
  const presetRank = new Map(input.presetOrder.map((tag, index) => [tag, index]));
  const techIssuesTop = [...counts.entries()]
    .sort((left, right) => {
      if (left[1] !== right[1]) return right[1] - left[1];
      const leftRank = presetRank.get(left[0]) ?? input.presetOrder.length;
      const rightRank = presetRank.get(right[0]) ?? input.presetOrder.length;
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (left[0] === right[0]) return 0;
      return left[0] < right[0] ? -1 : 1;
    })
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  const ranked = input.distances.flatMap((distance, order) => {
    const before = bestBefore(distance.entries, campStart);
    const after = bestDuring(distance.entries, campStart, campEnd);
    if (before === undefined && after === undefined) return [];
    const change: CampPbChange = {
      distanceId: distance.distanceId,
      label: distance.label,
      changed: after !== undefined && (before === undefined || after < before),
    };
    if (before !== undefined) change.before = before;
    if (after !== undefined) change.after = after;
    return [{ change, order }];
  });
  const pbChanges = ranked
    .sort((left, right) => {
      if (left.change.changed !== right.change.changed) return left.change.changed ? -1 : 1;
      return left.order - right.order;
    })
    .map((row) => row.change);

  return {
    totalCampDays: inclusiveCampDays(campStart, campEnd),
    trainingDays: trainingDates.size,
    iceCount,
    drylandCount,
    privateLessonCount,
    totalMinutes,
    totalSessions: sessions.length,
    pbChanges,
    techIssuesTop,
  };
}
