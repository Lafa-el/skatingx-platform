import type { RaceRosterEntry } from "@skatingx/schema";
import { ErrorNotice, StatusTag } from "@skatingx/ui";
import { useMemo, useState } from "react";

import { useLocale } from "@/hooks/useLocale";

import { VerificationBadge } from "../components/VerificationBadge";
import { DANGER_BUTTON, SECONDARY_BUTTON } from "../components/fields";
import { t } from "../i18n/messages";
import { sortRosterEntries } from "../lib/roster";

type RosterListProps = {
  entries: RaceRosterEntry[];
  busy: boolean;
  onEdit: (entry: RaceRosterEntry) => void;
  onSetVerified: (entry: RaceRosterEntry, verified: boolean) => void;
  onDelete: (entry: RaceRosterEntry) => void;
};

export function RosterList({ entries, busy, onEdit, onSetVerified, onDelete }: RosterListProps) {
  const locale = useLocale();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const sorted = useMemo(() => sortRosterEntries(entries, locale), [entries, locale]);

  if (sorted.length === 0) {
    return <p className="text-sm text-brand-navy/70">{t(locale, "raceDay.setup.roster.empty")}</p>;
  }

  return (
    <ul className="space-y-3">
      {sorted.map((entry) => {
        const confirming = confirmingId === entry.rosterId;
        const verified = entry.verification === "verified";
        return (
          <li
            key={entry.rosterId}
            className="rounded-card border border-brand-navy/10 bg-white p-4 shadow-card"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-brand-navy min-w-0 break-words">{entry.displayName}</span>
              {entry.isSelf ? (
                <StatusTag tone="brand">{t(locale, "raceDay.setup.roster.self")}</StatusTag>
              ) : entry.isFollowed ? (
                <span className="rounded-full bg-brand-ice px-2 py-0.5 text-xs font-semibold text-brand-navy">
                  {t(locale, "raceDay.setup.roster.following")}
                </span>
              ) : null}
              <VerificationBadge verification={entry.verification} />
            </div>
            <p className="mt-1 text-sm text-brand-navy/70">
              {t(locale, "raceDay.setup.roster.bib", { bib: entry.bib })} · {entry.division}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {confirming ? (
                <>
                  <ErrorNotice className="w-full">
                    {t(locale, "raceDay.setup.roster.deleteWarning")}
                  </ErrorNotice>
                  <button
                    type="button"
                    disabled={busy}
                    className={DANGER_BUTTON}
                    onClick={() => {
                      setConfirmingId(null);
                      onDelete(entry);
                    }}
                  >
                    {t(locale, "raceDay.common.confirmDelete")}
                    <span className="sr-only"> {entry.displayName}</span>
                  </button>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      setConfirmingId(null);
                    }}
                  >
                    {t(locale, "raceDay.common.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      onEdit(entry);
                    }}
                  >
                    {t(locale, "raceDay.common.edit")}
                    <span className="sr-only"> {entry.displayName}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      onSetVerified(entry, !verified);
                    }}
                  >
                    {t(
                      locale,
                      verified ? "raceDay.verification.markPending" : "raceDay.verification.markVerified",
                    )}
                    <span className="sr-only"> {entry.displayName}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      setConfirmingId(entry.rosterId);
                    }}
                  >
                    {t(locale, "raceDay.common.delete")}
                    <span className="sr-only"> {entry.displayName}</span>
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
