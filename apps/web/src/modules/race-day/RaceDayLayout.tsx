import { Outlet } from "react-router-dom";

import type { NavItem } from "@/app/navigation";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { SubNav } from "@/components/SubNav";
import { useLocale } from "@/hooks/useLocale";

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
    <div className="flex min-h-dvh flex-col">
      <Header />
      <SubNav items={items} label={t(locale, "raceDay.nav.section")} />
      <main className="mx-auto w-full max-w-5xl flex-1 break-words px-4 py-6 pb-[calc(var(--sx-nav-height)+1.5rem)]">
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t(locale, "raceDay.phase0.notice")}
        </p>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
