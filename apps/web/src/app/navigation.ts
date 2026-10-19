import { tNav, type NavMessageKey } from "@/shared/i18n/nav-messages";
import type { Locale } from "@/shared/i18n/translator";

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
  locale: Locale;
};

/**
 * Destinations and matching rules are language-independent and live here; only the label is
 * looked up. Keeping them apart is what lets the tests prove that switching language changes
 * text and never where a tab leads (ADR-004 S6b).
 */
type NavSpec = Omit<NavItem, "label"> & { labelKey: NavMessageKey };

const withLabels = (specs: readonly NavSpec[], locale: Locale): NavItem[] =>
  specs.map(({ labelKey, ...rest }) => ({ ...rest, label: tNav(locale, labelKey) }));

/**
 * Bottom navigation. With the Race Day flag off this is exactly the previous list. With it on,
 * Race Day takes the placeholder "AI Coach" tab's place (ADR-001 D3); the `/ai-coach` route
 * still exists and stays reachable from the Dashboard card.
 */
export function getPrimaryNav({ raceDay, raceDayLabel, locale }: PrimaryNavOptions): NavItem[] {
  const fourthTab: NavItem = raceDay
    ? { to: "/race-day", label: raceDayLabel, matchPrefix: true }
    : { to: "/ai-coach", label: tNav(locale, "nav.primary.aiCoach") };

  return [
    ...withLabels(
      [
        { to: "/dashboard", labelKey: "nav.primary.dashboard" },
        { to: "/training", labelKey: "nav.primary.training", matchPrefix: true },
        { to: "/analysis", labelKey: "nav.primary.analysis", matchPrefix: true },
      ],
      locale,
    ),
    fourthTab,
    ...withLabels([{ to: "/settings", labelKey: "nav.primary.settings" }], locale),
  ];
}

const TRAINING_SUB_NAV: readonly NavSpec[] = [
  { to: "/training", labelKey: "nav.training.home" },
  { to: "/training/plan", labelKey: "nav.training.plan" },
  { to: "/training/tasks", labelKey: "nav.training.tasks" },
  { to: "/training/academy", labelKey: "nav.training.academy" },
  { to: "/training/records", labelKey: "nav.training.records" },
  { to: "/training/shop", labelKey: "nav.training.shop" },
];

const ANALYSIS_SUB_NAV: readonly NavSpec[] = [
  { to: "/analysis", labelKey: "nav.analysis.hub" },
  { to: "/analysis/biomechanics", labelKey: "nav.analysis.biomechanics" },
  { to: "/analysis/pacing", labelKey: "nav.analysis.pacing" },
  { to: "/analysis/equipment", labelKey: "nav.analysis.equipment" },
];

export function getTrainingSubNav(locale: Locale): NavItem[] {
  return withLabels(TRAINING_SUB_NAV, locale);
}

export function getAnalysisSubNav(locale: Locale): NavItem[] {
  return withLabels(ANALYSIS_SUB_NAV, locale);
}

export function isNavActive(
  pathname: string,
  item: NavItem,
): boolean {
  if (item.matchPrefix) {
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }
  return pathname === item.to;
}
