import { Link, NavLink } from "react-router-dom";

import { NavIcon } from "@/components/NavIcon";
import { useLocale } from "@/hooks/useLocale";
import { usePrimaryNav } from "@/hooks/usePrimaryNav";
import { tNav } from "@/shared/i18n/nav-messages";

/**
 * Desktop navigation (from the `lg` breakpoint; the bottom bar takes over below it). Its width,
 * `w-64`, is mirrored by `lg:pl-64` in ShellFrame, which keeps the page clear of it.
 *
 * Selected item: warm-white fill with navy text and a flame bar at the left edge. Navy text on the
 * dark bar would not be readable, and white on flame fails contrast (design doc, appendix B.3).
 */
export function SideNav() {
  const locale = useLocale();
  const items = usePrimaryNav();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-navy px-3 py-4 lg:flex">
      <Link
        to="/dashboard"
        className="inline-flex min-h-11 items-center rounded-control px-3 text-xl font-extrabold italic tracking-tight text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        SkatingX
      </Link>
      <nav aria-label={tNav(locale, "nav.primary.label")} className="mt-6">
        <ul className="grid gap-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={!item.matchPrefix}
                className={({ isActive }) =>
                  [
                    "relative flex min-h-11 items-center gap-3 rounded-control px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                    isActive || item.active
                      ? "bg-brand-ice font-semibold text-brand-navy before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-brand-flame before:content-['']"
                      : "font-medium text-brand-ice/80 hover:bg-white/10 hover:text-white",
                  ].join(" ")
                }
              >
                <NavIcon to={item.to} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
