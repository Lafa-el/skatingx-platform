import { NavLink } from "react-router-dom";

import type { NavItem } from "@/app/navigation";
import { ScrollRow } from "@/components/ScrollRow";

type SubNavProps = {
  items: NavItem[];
  /** Accessible name of the navigation landmark. The caller passes a localized one. */
  label: string;
};

export function SubNav({ items, label }: SubNavProps) {
  return (
    // The tabs do not all fit on a phone (the English labels are longer), so the row scrolls.
    <ScrollRow
      as="nav"
      aria-label={label}
      className="border-b border-brand-navy/10 bg-white"
      rowClassName="flex gap-1 px-4 py-1"
      fadeFrom="white"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end ?? (item.to === "/training" || item.to === "/analysis")}
          className={({ isActive }) =>
            [
              "relative inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-navy",
              // Warm-white fill, navy text and a flame underline: the same selected look as the main bars.
              isActive
                ? "bg-brand-ice font-semibold text-brand-navy after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-brand-flame after:content-['']"
                : "font-medium text-brand-navy/70 hover:bg-brand-ice hover:text-brand-navy",
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}
    </ScrollRow>
  );
}
