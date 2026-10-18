import { Notice } from "@skatingx/ui";
import { Outlet } from "react-router-dom";

import type { NavItem } from "@/app/navigation";
import { SubNav } from "@/components/SubNav";
import { useLocale } from "@/hooks/useLocale";
import { ShellFrame } from "@/layouts/ShellFrame";

import { t } from "./i18n/messages";

export function RaceDayLayout() {
  const locale = useLocale();

  const items: NavItem[] = [
    { to: "/race-day", label: t(locale, "raceDay.tab.today"), end: true },
    { to: "/race-day/schedule", label: t(locale, "raceDay.tab.schedule") },
    { to: "/race-day/results", label: t(locale, "raceDay.tab.results") },
    { to: "/race-day/videos", label: t(locale, "raceDay.tab.videos") },
    { to: "/race-day/summary", label: t(locale, "raceDay.tab.summary") },
    { to: "/race-day/setup", label: t(locale, "raceDay.tab.setup") },
  ];

  return (
    <ShellFrame
      subNav={<SubNav items={items} label={t(locale, "raceDay.nav.section")} />}
      mainClassName="break-words"
    >
      <Notice tone="pending" className="mb-4">
        {t(locale, "raceDay.phase0.notice")}
      </Notice>
      <Outlet />
    </ShellFrame>
  );
}
