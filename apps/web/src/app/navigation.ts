export type NavItem = {
  to: string;
  label: string;
  /** Prefix match for nested routes (e.g. /training/tasks). */
  matchPrefix?: boolean;
  /** Match this exact path only, so a section's index tab is not active on its sub-pages. */
  end?: boolean;
};

export type PrimaryNavOptions = {
  /** `VITE_FEATURE_RACE_DAY` (ADR-001 D3). */
  raceDay: boolean;
  /** Localized label for the Race Day tab; only used when `raceDay` is on. */
  raceDayLabel: string;
};

/**
 * Bottom navigation. With the Race Day flag off this is exactly the previous list. With it on,
 * Race Day takes the placeholder "AI Coach" tab's place (ADR-001 D3); the `/ai-coach` route
 * still exists and stays reachable from the Dashboard card.
 */
export function getPrimaryNav({ raceDay, raceDayLabel }: PrimaryNavOptions): NavItem[] {
  const fourthTab: NavItem = raceDay
    ? { to: "/race-day", label: raceDayLabel, matchPrefix: true }
    : { to: "/ai-coach", label: "AI Coach" };

  return [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/training", label: "Training", matchPrefix: true },
    { to: "/analysis", label: "Analysis", matchPrefix: true },
    fourthTab,
    { to: "/settings", label: "Settings" },
  ];
}

export const trainingSubNav: NavItem[] = [
  { to: "/training", label: "Home" },
  { to: "/training/tasks", label: "Tasks" },
  { to: "/training/academy", label: "Academy" },
  { to: "/training/records", label: "Records" },
  { to: "/training/shop", label: "Shop" },
];

export const analysisSubNav: NavItem[] = [
  { to: "/analysis", label: "Hub" },
  { to: "/analysis/biomechanics", label: "Biomechanics" },
  { to: "/analysis/pacing", label: "Pacing" },
  { to: "/analysis/equipment", label: "Equipment" },
];

export function isNavActive(
  pathname: string,
  item: NavItem,
): boolean {
  if (item.matchPrefix) {
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }
  return pathname === item.to;
}
