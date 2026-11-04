import { getFirestoreDb, subscribeToAthleteProfiles, updateUserSettings, type AthleteRosterEntry } from "@skatingx/firebase-client";
import { ErrorNotice } from "@skatingx/ui";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { Avatar } from "@/components/Avatar";
import { useActiveAthlete, useAthleteProfile } from "@/hooks/firestore";
import { useAthletePhotoUrl } from "@/hooks/useAthletePhotoUrl";
import { useLocale } from "@/hooks/useLocale";
import { tShell } from "@/shared/i18n/shell-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

export function AthleteSelector() {
  const locale = useLocale();
  const { uid } = useAuth();
  const { athleteId, loading } = useActiveAthlete();
  const { data: profile } = useAthleteProfile();
  const noAthlete = !loading && athleteId == null;
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<AthleteRosterEntry[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const displayName = noAthlete
    ? tShell(locale, "shell.athlete.none")
    : (profile?.displayName ?? "…");
  const photoUrl = useAthletePhotoUrl(noAthlete ? null : profile?.avatarStoragePath);

  useEffect(() => {
    if (!uid) {
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setListFailed(true);
      return;
    }
    const sub = subscribeToAthleteProfiles(
      db,
      uid,
      (entries) => {
        setListFailed(false);
        setRoster(entries);
      },
      () => {
        logActionFailure("athlete-selector", "list", { code: "read" });
        setListFailed(true);
      },
    );
    return () => sub.unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
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

  const current: AthleteRosterEntry | null =
    athleteId == null ? null : { athleteId, displayName };
  const listed =
    current == null
      ? []
      : listFailed || !roster || roster.length === 0
        ? [current]
        : roster.some((entry) => entry.athleteId === athleteId)
          ? roster
          : [current, ...roster];

  async function switchTo(nextId: string) {
    if (!uid || nextId === athleteId) {
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setSwitchFailed(true);
      return;
    }
    setSwitchFailed(false);
    try {
      await updateUserSettings(db, uid, { activeAthleteId: nextId });
      setOpen(false);
    } catch (error) {
      logActionFailure("athlete-selector", "switch", error);
      setSwitchFailed(true);
    }
  }

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
        <Avatar letter={displayName.charAt(0)} photoUrl={photoUrl} />
        <span className="hidden text-left sm:inline">
          <span className="block font-medium text-brand-navy">{displayName}</span>
          {athleteId == null ? null : (
            <span className="block text-xs text-brand-navy/70">{athleteId}</span>
          )}
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
          {listed.map((entry) => {
            const active = entry.athleteId === athleteId;
            if (active) {
              return (
                <div
                  key={entry.athleteId}
                  role="option"
                  aria-selected
                  className="flex w-full items-center gap-3 bg-brand-ice px-3 py-2 text-left text-sm text-brand-navy"
                >
                  <Avatar letter={entry.displayName.charAt(0)} photoUrl={photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.displayName}</span>
                    <span className="block truncate text-xs text-brand-navy/70">{entry.athleteId}</span>
                  </span>
                  <span className="text-xs font-semibold text-brand-navy">
                    {tShell(locale, "shell.athlete.active")}
                  </span>
                </div>
              );
            }
            return (
              <button
                key={entry.athleteId}
                type="button"
                role="option"
                aria-selected={false}
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm text-brand-navy hover:bg-brand-ice"
                onClick={() => void switchTo(entry.athleteId)}
              >
                <Avatar letter={entry.displayName.charAt(0)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{entry.displayName}</span>
                  <span className="block truncate text-xs text-brand-navy/70">{entry.athleteId}</span>
                </span>
              </button>
            );
          })}

          {switchFailed ? (
            <ErrorNotice className="mx-3 my-2">{tShell(locale, "shell.athlete.switchFailed")}</ErrorNotice>
          ) : null}

          <div className="my-1 border-t border-brand-navy/10" />

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

