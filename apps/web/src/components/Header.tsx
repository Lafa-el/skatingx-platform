import { Link } from "react-router-dom";

import { AthleteSelector } from "@/components/AthleteSelector";
import { usePrimaryNav } from "@/hooks/usePrimaryNav";

export function Header() {
  const current = usePrimaryNav().find((item) => item.active);

  return (
    <header className="sticky top-0 z-20 border-b border-brand-navy/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        {/* From `lg` the side bar carries the name; here it is a trail to the current section. */}
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center text-lg font-extrabold italic tracking-tight text-brand-navy lg:hidden"
        >
          SkatingX
        </Link>
        <p className="hidden text-sm text-brand-navy/70 lg:block">
          <span>SkatingX</span>
          {current ? (
            <>
              <span aria-hidden="true"> / </span>
              <span className="font-semibold text-brand-navy">{current.label}</span>
            </>
          ) : null}
        </p>
        <AthleteSelector />
      </div>
    </header>
  );
}
