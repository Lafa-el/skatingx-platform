import { useLocation } from "react-router-dom";

import { isRaceDayEnabled } from "@/app/features";
import { getPrimaryNav, isNavActive, type NavItem } from "@/app/navigation";
import { useLocale } from "@/hooks/useLocale";
import { tCore } from "@/modules/race-day/i18n/core-messages";

export type PrimaryNavEntry = NavItem & { active: boolean };

/** The main destinations, shared by the side bar (desktop) and the bottom bar (phone). */
export function usePrimaryNav(): PrimaryNavEntry[] {
  const { pathname } = useLocation();
  const locale = useLocale();
  return getPrimaryNav({
    raceDay: isRaceDayEnabled(),
    raceDayLabel: tCore(locale, "raceDay.nav.title"),
    locale,
  }).map((item) => ({ ...item, active: isNavActive(pathname, item) }));
}
