import { Link } from "react-router-dom";

import { AthleteSelector } from "@/components/AthleteSelector";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center text-lg font-bold tracking-tight text-sky-700"
        >
          SkatingX
        </Link>
        <AthleteSelector />
      </div>
    </header>
  );
}
