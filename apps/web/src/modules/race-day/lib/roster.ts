import type { RaceRosterEntry } from "@skatingx/schema";

/** The user's own athlete first, then followed athletes, then the rest; names within a group. */
export function sortRosterEntries(
  entries: readonly RaceRosterEntry[],
  locale: string,
): RaceRosterEntry[] {
  const rank = (e: RaceRosterEntry) => (e.isSelf ? 0 : e.isFollowed ? 1 : 2);
  return [...entries].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.displayName.localeCompare(b.displayName, locale) ||
      a.rosterId.localeCompare(b.rosterId),
  );
}
