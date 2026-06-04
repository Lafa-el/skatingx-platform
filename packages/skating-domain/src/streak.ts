import type { DateString } from "@skatingx/schema";

import { previousDateString, todayDateString } from "./dates";

/**
 * Consecutive completed calendar days ending today (if today completed) or yesterday.
 * Matches legacy blaze-skate-training streak logic.
 */
export function calculateStreakDays(
  completedDays: DateString[],
  today: DateString = todayDateString(),
): number {
  if (completedDays.length === 0) {
    return 0;
  }

  const set = new Set(completedDays);
  const yesterday = previousDateString(today);

  if (!set.has(today) && !set.has(yesterday)) {
    return 0;
  }

  let streak = 0;
  let cursor = set.has(today) ? today : yesterday;

  while (set.has(cursor)) {
    streak += 1;
    cursor = previousDateString(cursor);
  }

  return streak;
}
