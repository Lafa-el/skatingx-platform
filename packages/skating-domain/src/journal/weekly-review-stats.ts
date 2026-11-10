import { addDaysToDateString } from "../training/plan-progress";

/**
 * One week's numbers, derived on the page and never written.
 * The window is Monday through Sunday, closed on both ends, so Sunday belongs to this week
 * and the next Monday does not. Session `notes` are left out of the focus tally: a free-text
 * note is not a technical tag.
 */

export type WeeklyReviewDay = {
  date: string;
};

export type WeeklyReviewSession = {
  date: string;
  sessionType?: string;
  durationMinutes?: number;
  focusTags?: readonly string[];
  technicalFocus?: string;
  notes?: string;
};

export type WeeklyReviewCoachNote = {
  date: string;
  priority?: string;
  coachName?: string;
  note?: string;
  technicalTags?: readonly string[];
};

export type WeeklyReviewTimeEntry = {
  date: string;
  timeSeconds: number;
};

export type WeeklyReviewDistance = {
  distanceId: string;
  label: string;
  entries: readonly WeeklyReviewTimeEntry[];
};

export type WeeklyReviewStatsInput = {
  weekStart: string;
  days: readonly WeeklyReviewDay[];
  sessions: readonly WeeklyReviewSession[];
  notes: readonly WeeklyReviewCoachNote[];
  distances: readonly WeeklyReviewDistance[];
  /** Known tag order. Equal counts keep this order; a free-text focus sorts after it. */
  presetOrder: readonly string[];
};

export type WeeklyReviewFocusCount = {
  label: string;
  count: number;
};

export type WeeklyReviewNoteSummary = {
  date: string;
  priority: string;
  coachName?: string;
  note: string;
};

export type WeeklyReviewBestTime = {
  distanceId: string;
  label: string;
  timeSeconds: number;
};

export type WeeklyReviewStats = {
  trainingDays: number;
  iceCount: number;
  drylandCount: number;
  privateLessonCount: number;
  totalMinutes: number;
  totalSessions: number;
  focusTop: WeeklyReviewFocusCount[];
  notesTop: WeeklyReviewNoteSummary[];
  bestTimes: WeeklyReviewBestTime[];
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const UNRANKED_PRIORITY = 3;

function inWeek(date: string, weekStart: string, weekEnd: string): boolean {
  return date >= weekStart && date <= weekEnd;
}

function addCount(counts: Map<string, number>, label: string) {
  const text = label.trim();
  if (text.length === 0) return;
  counts.set(text, (counts.get(text) ?? 0) + 1);
}

export function deriveWeeklyReviewStats(input: WeeklyReviewStatsInput): WeeklyReviewStats {
  const weekEnd = addDaysToDateString(input.weekStart, 6);
  const days = input.days.filter((day) => inWeek(day.date, input.weekStart, weekEnd));
  const sessions = input.sessions.filter((session) => inWeek(session.date, input.weekStart, weekEnd));
  const notes = input.notes.filter((note) => inWeek(note.date, input.weekStart, weekEnd));

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
    const minutes = session.durationMinutes;
    if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) totalMinutes += minutes;
  }

  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.technicalTags ?? []) addCount(counts, tag);
  }
  for (const session of sessions) {
    for (const tag of session.focusTags ?? []) addCount(counts, tag);
    if (session.technicalFocus !== undefined) addCount(counts, session.technicalFocus);
  }
  const presetRank = new Map(input.presetOrder.map((tag, index) => [tag, index]));
  const focusTop = [...counts.entries()]
    .sort((left, right) => {
      if (left[1] !== right[1]) return right[1] - left[1];
      const leftRank = presetRank.get(left[0]) ?? input.presetOrder.length;
      const rightRank = presetRank.get(right[0]) ?? input.presetOrder.length;
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (left[0] === right[0]) return 0;
      return left[0] < right[0] ? -1 : 1;
    })
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  const notesTop = [...notes]
    .sort((left, right) => {
      const leftRank = PRIORITY_RANK[left.priority ?? ""] ?? UNRANKED_PRIORITY;
      const rightRank = PRIORITY_RANK[right.priority ?? ""] ?? UNRANKED_PRIORITY;
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (left.date !== right.date) return left.date < right.date ? 1 : -1;
      return 0;
    })
    .slice(0, 5)
    .map((note) => {
      const summary: WeeklyReviewNoteSummary = {
        date: note.date,
        priority: note.priority ?? "",
        note: note.note?.trim() ?? "",
      };
      const coachName = note.coachName?.trim();
      if (coachName) summary.coachName = coachName;
      return summary;
    });

  const bestTimes: WeeklyReviewBestTime[] = [];
  for (const distance of input.distances) {
    let best: number | undefined;
    for (const entry of distance.entries) {
      if (!inWeek(entry.date, input.weekStart, weekEnd)) continue;
      if (!Number.isFinite(entry.timeSeconds) || entry.timeSeconds <= 0) continue;
      if (best === undefined || entry.timeSeconds < best) best = entry.timeSeconds;
    }
    if (best !== undefined) {
      bestTimes.push({ distanceId: distance.distanceId, label: distance.label, timeSeconds: best });
    }
  }

  return {
    trainingDays: trainingDates.size,
    iceCount,
    drylandCount,
    privateLessonCount,
    totalMinutes,
    totalSessions: sessions.length,
    focusTop,
    notesTop,
    bestTimes,
  };
}
