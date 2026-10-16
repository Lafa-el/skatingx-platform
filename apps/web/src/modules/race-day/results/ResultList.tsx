import { formatResultTime } from "@skatingx/skating-domain";
import { useState } from "react";

import { useLocale } from "@/hooks/useLocale";

import { VerificationBadge } from "../components/VerificationBadge";
import { DANGER_BUTTON, FormMessage, SECONDARY_BUTTON } from "../components/fields";
import { t } from "../i18n/messages";
import type { ResultView } from "../lib/results";

type ResultListProps = {
  views: readonly ResultView[];
  busy: boolean;
  onEdit: (view: ResultView) => void;
  onSetVerified: (view: ResultView, verified: boolean) => void;
  onDelete: (view: ResultView) => void;
};

/** The results feed: newest change first. Every row carries its own verification marker. */
export function ResultList({ views, busy, onEdit, onSetVerified, onDelete }: ResultListProps) {
  const locale = useLocale();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    // Polite live region: a result entered on another device is announced without stealing focus.
    <ul aria-live="polite" aria-relevant="additions" className="space-y-3">
      {views.map((view) => {
        const { result, race, raceNumber, athlete } = view;
        const confirming = confirmingId === result.resultId;
        const verified = result.verification === "verified";
        const raceName = race
          ? `${raceNumber === null ? "" : `#${String(raceNumber)} `}${race.label}`
          : t(locale, "raceDay.results.item.unknownRace");
        const athleteName = athlete?.displayName ?? t(locale, "raceDay.results.item.unknownAthlete");
        const suffix = <span className="sr-only"> {`${raceName} ${athleteName}`}</span>;

        return (
          <li key={result.resultId} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-slate-900 min-w-0 break-words">{athleteName}</span>
              {athlete ? <span className="text-sm text-slate-500">#{athlete.bib}</span> : null}
              <VerificationBadge verification={result.verification} />
            </div>
            <p className="mt-1 text-sm text-slate-600">{raceName}</p>

            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 text-slate-900">
              {result.status === "finished" && result.timeSeconds !== null ? (
                <span className="text-xl font-bold tabular-nums">{formatResultTime(result.timeSeconds)}</span>
              ) : (
                <span className="text-base font-semibold">{t(locale, `raceDay.results.status.${result.status}`)}</span>
              )}
              {result.place !== null ? (
                <span className="text-sm">{t(locale, "raceDay.results.item.place", { place: result.place })}</span>
              ) : null}
              {result.advanced === true ? (
                <span className="text-sm">{t(locale, "raceDay.results.advanced.yes")}</span>
              ) : null}
              {result.advanced === false ? (
                <span className="text-sm">{t(locale, "raceDay.results.advanced.no")}</span>
              ) : null}
            </p>

            {race && !view.athleteInRace ? (
              <p className="mt-2 text-sm text-amber-800">{t(locale, "raceDay.results.item.removedFromRace")}</p>
            ) : null}
            {result.sourceNote ? <p className="mt-1 text-sm text-slate-500">{result.sourceNote}</p> : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {confirming ? (
                <>
                  <div className="w-full">
                    <FormMessage tone="error">{t(locale, "raceDay.results.item.deleteWarning")}</FormMessage>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className={DANGER_BUTTON}
                    onClick={() => {
                      setConfirmingId(null);
                      onDelete(view);
                    }}
                  >
                    {t(locale, "raceDay.common.confirmDelete")}
                    {suffix}
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
                  {race ? (
                    <button
                      type="button"
                      disabled={busy}
                      className={SECONDARY_BUTTON}
                      onClick={() => {
                        onEdit(view);
                      }}
                    >
                      {t(locale, "raceDay.common.edit")}
                      {suffix}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      onSetVerified(view, !verified);
                    }}
                  >
                    {t(
                      locale,
                      verified ? "raceDay.verification.markPending" : "raceDay.verification.markVerified",
                    )}
                    {suffix}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      setConfirmingId(result.resultId);
                    }}
                  >
                    {t(locale, "raceDay.common.delete")}
                    {suffix}
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
