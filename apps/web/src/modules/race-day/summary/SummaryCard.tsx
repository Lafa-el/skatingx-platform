import type { RaceSummary } from "@skatingx/skating-domain";
import { formatResultTime } from "@skatingx/skating-domain";

import { useLocale } from "@/hooks/useLocale";

import { VerificationBadge } from "../components/VerificationBadge";
import { t } from "../i18n/messages";

type SummaryCardProps = {
  summary: RaceSummary;
  /** "#n" of each race in the whole schedule, as on the Schedule tab. */
  raceNumbers: ReadonlyMap<string, number>;
};

/**
 * Facts only: times, places, advancement and how much is still unchecked. The number of pending
 * results comes first because the rest of the card is only as final as that number says.
 */
export function SummaryCard({ summary, raceNumbers }: SummaryCardProps) {
  const locale = useLocale();
  const { athlete, items } = summary;

  return (
    <article aria-labelledby="summary-card-title" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <header>
        <h2 id="summary-card-title" className="text-lg font-semibold text-slate-900">
          {t(locale, "raceDay.summary.card.title", { name: athlete.displayName })}
        </h2>
        <p className="text-sm text-slate-600">
          {t(locale, "raceDay.summary.card.athlete", { bib: athlete.bib, division: athlete.division })}
        </p>
      </header>

      {summary.racesWithResult === 0 ? (
        <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {t(locale, "raceDay.summary.noResults")}
        </p>
      ) : summary.pendingResultCount > 0 ? (
        <div
          role="status"
          data-testid="pending-banner"
          className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950"
        >
          <p className="text-base font-bold">
            {t(locale, "raceDay.summary.pending", { count: summary.pendingResultCount })}
          </p>
          <p className="text-sm">{t(locale, "raceDay.summary.pendingHelp")}</p>
        </div>
      ) : (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {t(locale, "raceDay.summary.allConfirmed")}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t(locale, "raceDay.summary.stat.races")} value={String(summary.racesTotal)} />
        <Stat label={t(locale, "raceDay.summary.stat.withResult")} value={String(summary.racesWithResult)} />
        <Stat label={t(locale, "raceDay.summary.stat.finished")} value={String(summary.racesFinished)} />
        <Stat
          label={t(locale, "raceDay.summary.stat.fastest")}
          value={summary.fastestConfirmedSeconds === null ? null : formatResultTime(summary.fastestConfirmedSeconds)}
          emptyText={t(locale, "raceDay.summary.stat.fastestNone")}
        />
      </dl>

      {items.length === 0 ? (
        <p className="text-sm text-slate-600">{t(locale, "raceDay.summary.noRaces")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const number = raceNumbers.get(item.raceId);
            return (
              <li key={item.raceId} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 min-w-0 break-words">
                    {number === undefined ? "" : `#${String(number)} `}
                    {item.label}
                  </span>
                  {item.status !== null ? (
                    <VerificationBadge verification={item.confirmed ? "verified" : "pending"} />
                  ) : null}
                </div>
                {item.status === null ? (
                  <p className="mt-1 text-sm text-slate-500">{t(locale, "raceDay.summary.item.noResult")}</p>
                ) : (
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-slate-900">
                    {item.status === "finished" && item.timeSeconds !== null ? (
                      <span className="text-lg font-bold tabular-nums">{formatResultTime(item.timeSeconds)}</span>
                    ) : (
                      <span className="text-base font-semibold">{t(locale, `raceDay.results.status.${item.status}`)}</span>
                    )}
                    {item.place !== null ? (
                      <span className="text-sm">{t(locale, "raceDay.results.item.place", { place: item.place })}</span>
                    ) : null}
                    {item.advanced === true ? (
                      <span className="text-sm">{t(locale, "raceDay.results.advanced.yes")}</span>
                    ) : null}
                    {item.advanced === false ? (
                      <span className="text-sm">{t(locale, "raceDay.results.advanced.no")}</span>
                    ) : null}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <footer className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <p>{t(locale, "raceDay.summary.disclaimer")}</p>
        <p>{t(locale, "raceDay.summary.version", { version: summary.summaryVersion })}</p>
      </footer>
    </article>
  );
}

function Stat({ label, value, emptyText }: { label: string; value: string | null; emptyText?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="mt-1 text-base font-bold tabular-nums text-slate-900">
        {value ?? <span className="text-sm font-normal text-slate-500">{emptyText ?? "—"}</span>}
      </dd>
    </div>
  );
}
