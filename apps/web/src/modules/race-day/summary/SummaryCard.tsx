import type { RaceSummary } from "@skatingx/skating-domain";
import { formatResultTime } from "@skatingx/skating-domain";
import { Notice } from "@skatingx/ui";

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
    <article aria-labelledby="summary-card-title" className="space-y-4 rounded-card border border-brand-navy/10 bg-white p-4 shadow-card">
      <header>
        <h2 id="summary-card-title" className="text-lg font-semibold text-brand-navy">
          {t(locale, "raceDay.summary.card.title", { name: athlete.displayName })}
        </h2>
        <p className="text-sm text-brand-navy/70">
          {t(locale, "raceDay.summary.card.athlete", { bib: athlete.bib, division: athlete.division })}
        </p>
      </header>

      {summary.racesWithResult === 0 ? (
        <Notice tone="info" role="status">
          {t(locale, "raceDay.summary.noResults")}
        </Notice>
      ) : summary.pendingResultCount > 0 ? (
        <div
          role="status"
          data-testid="pending-banner"
          className="space-y-1 rounded-control border-2 border-brand-energy bg-status-pending-tint px-3 py-2 text-brand-navy"
        >
          <p className="text-base font-bold">
            {t(locale, "raceDay.summary.pending", { count: summary.pendingResultCount })}
          </p>
          <p className="text-sm">{t(locale, "raceDay.summary.pendingHelp")}</p>
        </div>
      ) : (
        <Notice tone="success" role="status">
          {t(locale, "raceDay.summary.allConfirmed")}
        </Notice>
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
        <p className="text-sm text-brand-navy/70">{t(locale, "raceDay.summary.noRaces")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const number = raceNumbers.get(item.raceId);
            return (
              <li key={item.raceId} className="rounded-control border border-brand-navy/10 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-brand-navy min-w-0 break-words">
                    {number === undefined ? "" : `#${String(number)} `}
                    {item.label}
                  </span>
                  {item.status !== null ? (
                    <VerificationBadge verification={item.confirmed ? "verified" : "pending"} />
                  ) : null}
                </div>
                {item.status === null ? (
                  <p className="mt-1 text-sm text-brand-navy/70">{t(locale, "raceDay.summary.item.noResult")}</p>
                ) : (
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-brand-navy">
                    {item.status === "finished" && item.timeSeconds !== null ? (
                      <span className="sx-numeric text-lg">{formatResultTime(item.timeSeconds)}</span>
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

      <footer className="space-y-1 border-t border-brand-navy/10 pt-3 text-xs text-brand-navy/70">
        <p>{t(locale, "raceDay.summary.disclaimer")}</p>
        <p>{t(locale, "raceDay.summary.version", { version: summary.summaryVersion })}</p>
      </footer>
    </article>
  );
}

function Stat({ label, value, emptyText }: { label: string; value: string | null; emptyText?: string }) {
  return (
    <div className="rounded-control bg-brand-ice px-3 py-2">
      <dt className="text-xs text-brand-navy/70">{label}</dt>
      <dd className="mt-1 text-base text-brand-navy">
        {value !== null ? (
          <span className="sx-numeric">{value}</span>
        ) : (
          <span className="text-sm text-brand-navy/70">{emptyText ?? "—"}</span>
        )}
      </dd>
    </div>
  );
}
