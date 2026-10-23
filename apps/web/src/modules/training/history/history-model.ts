/**
 * Calendar view of one month of task-history archives. The page loads only that month;
 * these functions never ask for the rest of the collection.
 */

export type HistoryMonth = {
  readonly year: number;
  readonly month: number;
};

const DATE_ID = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isRealDateId(dateId: string): boolean {
  const match = DATE_ID.exec(dateId);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

export function monthFromDateId(dateId: string): HistoryMonth | null {
  if (!isRealDateId(dateId)) return null;
  const match = DATE_ID.exec(dateId);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function shiftMonth(month: HistoryMonth, delta: number): HistoryMonth {
  const index = month.year * 12 + (month.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Next month is allowed only while it is still the month that contains today, or earlier. */
export function canShowNextMonth(visible: HistoryMonth, today: string): boolean {
  const current = monthFromDateId(today);
  if (!current) return false;
  return visible.year < current.year || (visible.year === current.year && visible.month < current.month);
}

export function isDateInMonth(dateId: string, month: HistoryMonth): boolean {
  const parsed = monthFromDateId(dateId);
  return parsed !== null && parsed.year === month.year && parsed.month === month.month;
}

/** Inclusive document-id bounds. Dictionary order of `YYYY-MM-DD` is date order. */
export function monthDateBounds(month: HistoryMonth): { start: string; end: string } {
  const last = new Date(month.year, month.month, 0).getDate();
  const mm = String(month.month).padStart(2, "0");
  return {
    start: `${String(month.year)}-${mm}-01`,
    end: `${String(month.year)}-${mm}-${String(last).padStart(2, "0")}`,
  };
}

/**
 * Monday-first grid. Leading and trailing blanks pad the month out to whole weeks.
 * Each filled cell is that day's document id.
 */
export function calendarCells(month: HistoryMonth): readonly (string | null)[] {
  const { start, end } = monthDateBounds(month);
  const [year, monthNumber, day] = start.split("-").map(Number);
  const firstWeekday = new Date(year, monthNumber - 1, day).getDay();
  const leading = (firstWeekday + 6) % 7;
  const last = Number(end.slice(-2));
  const mm = String(month.month).padStart(2, "0");
  const days = Array.from({ length: last }, (_, index) => `${String(month.year)}-${mm}-${String(index + 1).padStart(2, "0")}`);
  const cells: (string | null)[] = [...Array<string | null>(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export type DayMark = {
  archived: boolean;
  fullAttendance: boolean;
  today: boolean;
};

export function dayMark(
  dateId: string,
  archived: ReadonlySet<string>,
  completedDays: ReadonlySet<string>,
  today: string,
): DayMark {
  return {
    archived: archived.has(dateId),
    fullAttendance: completedDays.has(dateId),
    today: dateId === today,
  };
}

/** Latest archived day in the ids the caller already loaded. No archives means today. */
export function defaultSelectedDate(archivedDateIds: readonly string[], today: string): string {
  const latest = archivedDateIds.reduce<string | null>((best, dateId) => {
    if (!isRealDateId(dateId)) return best;
    if (best === null || dateId > best) return dateId;
    return best;
  }, null);
  return latest ?? today;
}

/**
 * A picked day stays while it belongs to the month on screen. Otherwise the latest
 * archive in the loaded month is used. A month with no archive selects today when
 * today is in that month, and the first day of the month when it is not: the detail
 * only describes a day this query actually loaded.
 */
export function resolveSelectedDate(
  picked: string | null,
  visible: HistoryMonth,
  archivedDateIds: readonly string[],
  today: string,
): string {
  if (picked && isDateInMonth(picked, visible)) return picked;
  const latest = defaultSelectedDate(archivedDateIds, today);
  if (isDateInMonth(latest, visible)) return latest;
  return monthDateBounds(visible).start;
}

export function completionCount(tasks: readonly { completed: boolean }[]): { done: number; total: number } {
  return {
    done: tasks.filter((task) => task.completed).length,
    total: tasks.length,
  };
}
