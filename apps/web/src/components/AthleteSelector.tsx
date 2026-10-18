import { useId, useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";

import { useActiveAthlete, useAthleteProfile } from "@/hooks/firestore";
import { useLocale } from "@/hooks/useLocale";
import { tShell } from "@/shared/i18n/shell-messages";

export function AthleteSelector() {
  const locale = useLocale();
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
        className="flex min-h-11 items-center gap-2 rounded-control border border-brand-navy/15 px-3 py-1.5 text-sm hover:bg-brand-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:opacity-60"
      >
        <span
          className="sx-energy-gradient flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-brand-navy"
          aria-hidden
        >
          {displayName.charAt(0)}
        </span>
        <span className="hidden text-left sm:inline">
          <span className="block font-medium text-brand-navy">
            {displayName}
          </span>
          <span className="block text-xs text-brand-navy/70">{athleteId}</span>
        </span>
        <span className="text-brand-navy/60" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={tShell(locale, "shell.athlete.listLabel")}
          className="absolute right-0 z-50 mt-2 w-56 rounded-card border border-brand-navy/10 bg-white py-1 shadow-card"
        >
          <div
            role="option"
            aria-selected
            className="flex w-full items-center gap-3 bg-brand-ice px-3 py-2 text-left text-sm text-brand-navy"
          >
            <span
              className="sx-energy-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-brand-navy"
              aria-hidden
            >
              {displayName.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{displayName}</span>
              <span className="block truncate text-xs text-brand-navy/70">
                {athleteId}
              </span>
            </span>
            <span className="text-xs font-semibold text-brand-navy">
              {tShell(locale, "shell.athlete.active")}
            </span>
          </div>

          <div className="my-1 border-t border-brand-navy/10" />

          <p className="px-3 py-2 text-xs text-brand-navy/70">
            {tShell(locale, "shell.athlete.switchingLater")}
          </p>

          <Link
            to="/athlete"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center px-3 text-sm font-semibold text-brand-navy underline underline-offset-2 hover:bg-brand-ice"
          >
            {tShell(locale, "shell.athlete.profileLink")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
