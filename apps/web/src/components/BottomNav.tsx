import { NavLink } from "react-router-dom";

import { NavIcon } from "@/components/NavIcon";
import { useLocale } from "@/hooks/useLocale";
import { usePrimaryNav } from "@/hooks/usePrimaryNav";
import { tNav } from "@/shared/i18n/nav-messages";

/**
 * Phone navigation (hidden from the `lg` breakpoint, where the side bar takes over). On white, so
 * the selected item is navy text with a flame bar on top and a flame icon (flame on white is
 * 3.51:1, enough for a graphic but not for text).
 */
export function BottomNav() {
  const locale = useLocale();
  const items = usePrimaryNav();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-brand-navy/10 bg-white lg:hidden"
      style={{ height: "var(--sx-nav-height)" }}
      aria-label={tNav(locale, "nav.primary.label")}
    >
      <ul className="mx-auto flex h-full max-w-5xl items-stretch justify-around">
        {items.map((item) => (
          <li key={item.to} className="flex flex-1">
            <NavLink
              to={item.to}
              end={!item.matchPrefix}
              className={({ isActive }) =>
                [
                  "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-navy",
                  isActive || item.active
                    ? "font-semibold text-brand-navy before:absolute before:inset-x-5 before:top-0 before:h-1 before:rounded-b-full before:bg-brand-flame before:content-['']"
                    : "font-medium text-brand-navy/70 hover:text-brand-navy",
                ].join(" ")
              }
            >
              <NavIcon
                to={item.to}
                className={`size-5 ${item.active ? "text-brand-flame" : ""}`.trim()}
              />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
