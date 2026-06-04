import { NavLink } from "react-router-dom";

import type { NavItem } from "@/app/navigation";

type SubNavProps = {
  items: NavItem[];
};

export function SubNav({ items }: SubNavProps) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2"
      aria-label="Section"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/training" || item.to === "/analysis"}
          className={({ isActive }) =>
            [
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-sky-100 text-sky-800"
                : "text-slate-600 hover:bg-slate-100",
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
