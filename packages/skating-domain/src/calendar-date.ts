const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True only for real calendar days: "2026-02-30" is rejected, not rolled over.
 *
 * Its own small file on purpose: the plan page needs only this check, and living in
 * `race-day-input.ts` it would pull all of Race Day's form validation into the plan page's download.
 */
export function isRealDateString(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
