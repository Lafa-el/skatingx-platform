import { NavLink, useLocation } from "react-router-dom";

import { isRaceDayEnabled } from "@/app/features";
import { getPrimaryNav, isNavActive } from "@/app/navigation";
import { useLocale } from "@/hooks/useLocale";
import { tCore } from "@/modules/race-day/i18n/core-messages";

export function BottomNav() {
  const { pathname } = useLocation();
  const locale = useLocale();
  const primaryNav = getPrimaryNav({
    raceDay: isRaceDayEnabled(),
    raceDayLabel: tCore(locale, "raceDay.nav.title"),
  });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white"
      style={{ height: "var(--sx-nav-height)" }}
      aria-label="Main"
    >
      <ul className="mx-auto flex h-full max-w-5xl items-stretch justify-around">
        {primaryNav.map((item) => (
          <li key={item.to} className="flex flex-1">
            <NavLink
              to={item.to}
              end={!item.matchPrefix}
              className={({ isActive }) => {
                const active = isActive || isNavActive(pathname, item);
                return [
                  "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                  active ? "text-sky-700" : "text-slate-500 hover:text-slate-800",
                ].join(" ");
              }}
            >
              <span className="text-[10px] uppercase tracking-wide">
                {item.label}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
