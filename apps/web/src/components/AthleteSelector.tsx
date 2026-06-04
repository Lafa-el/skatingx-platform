import { useId, useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";

import { useActiveAthlete, useAthleteProfile } from "@/hooks/firestore";

export function AthleteSelector() {
  const { athleteId, loading } = useActiveAthlete();
  const { data: profile } = useAthleteProfile();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const displayName = profile?.displayName ?? "…";

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((prev) => !prev)}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800"
          aria-hidden
        >
          {displayName.charAt(0)}
        </span>
        <span className="hidden text-left sm:inline">
          <span className="block font-medium text-slate-900">
            {displayName}
          </span>
          <span className="block text-xs text-slate-500">{athleteId}</span>
        </span>
        <span className="text-slate-400" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Select athlete"
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div
            role="option"
            aria-selected
            className="flex w-full items-center gap-3 bg-sky-50 px-3 py-2 text-left text-sm text-sky-900"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold"
              aria-hidden
            >
              {displayName.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{displayName}</span>
              <span className="block truncate text-xs text-slate-500">
                {athleteId}
              </span>
            </span>
            <span className="text-xs font-medium text-sky-700">Active</span>
          </div>

          <div className="my-1 border-t border-slate-100" />

          <p className="px-3 py-2 text-xs text-slate-500">
            Multi-athlete switching — coming in a later phase.
          </p>

          <Link
            to="/athlete"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm font-medium text-sky-700 hover:bg-slate-50"
          >
            Athlete profile →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
