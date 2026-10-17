import type { Locale } from "./translator";

/**
 * Locale-aware formatting for text shared across pages (ADR-004 D7). Race Day keeps its own
 * schedule formatting, which also shows weekdays and time zones; this is the plain calendar day.
 */

const TAG: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `YYYY-MM-DD` as a date in the language ("2026年10月16日" / "Oct 16, 2026").
 *
 * A calendar day has no time of day, so it is read and shown as UTC; reading it as local midnight
 * would show the previous day west of UTC. Anything that is not a real calendar day is returned
 * unchanged: showing the stored text is better than showing a wrong date.
 */
export function formatCalendarDate(day: string, locale: Locale): string {
  const match = CALENDAR_DAY.exec(day);
  if (!match) {
    return day;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const instant = new Date(Date.UTC(year, month - 1, date));
  // `Date.UTC` rolls 2026-02-31 over to March and maps two-digit years to 19xx; a round trip
  // that changes any part means the input was not a real day.
  if (
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== date
  ) {
    return day;
  }
  return new Intl.DateTimeFormat(TAG[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(instant);
}
