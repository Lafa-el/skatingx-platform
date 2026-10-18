import type { RaceEvent, RaceRosterEntry } from "@skatingx/schema";
import type { TodayRace, TodayView } from "@skatingx/skating-domain";
import { StatusTag } from "@skatingx/ui";
import { Link } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";

import { FormMessage, PRIMARY_BUTTON, SECONDARY_BUTTON, SURFACE_CARD } from "../components/fields";
import { VerificationBadge } from "../components/VerificationBadge";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import { formatRaceDay, formatRaceDays, formatRaceTime } from "../lib/schedule";

const UNDETERMINED_KEY = {
  noTimeZone: "raceDay.today.undetermined.noTimeZone",
  badTimeZone: "raceDay.today.undetermined.badTimeZone",
  noDates: "raceDay.today.undetermined.noDates",
  badClock: "raceDay.today.undetermined.badClock",
} as const satisfies Record<string, RaceDayMessageKey>;

type TodayBoardProps = {
  event: RaceEvent;
  view: TodayView;
  roster: readonly RaceRosterEntry[];
  /** Name shown when several athletes are marked as the user's own; null otherwise. */
  multipleSelfName: string | null;
};

/** Read-only: everything here comes from data entered on the other tabs. */
export function TodayBoard({ event, view, roster, multipleSelfName }: TodayBoardProps) {
  const locale = useLocale();
  const nameById = new Map(roster.map((entry) => [entry.rosterId, entry.displayName]));
  const { phase } = view;
  const nextRace = view.next.kind === "race" ? view.next.raceId : null;
  const next = view.races.find((r) => r.race.raceId === nextRace) ?? null;

  const phaseText =
    phase.kind === "today"
      ? t(locale, "raceDay.today.phase.today")
      : phase.kind === "before"
        ? t(locale, "raceDay.today.phase.before", {
            count: phase.daysUntil,
            day: formatRaceDay(phase.firstDay, locale),
          })
        : phase.kind === "between"
          ? t(locale, "raceDay.today.phase.between", { day: formatRaceDay(phase.nextDay, locale) })
          : phase.kind === "after"
            ? t(locale, "raceDay.today.phase.after")
            : t(locale, UNDETERMINED_KEY[phase.reason]);

  function raceRow(item: TodayRace, highlight: boolean) {
    const { race } = item;
    return (
      <li
        key={race.raceId}
        data-testid={highlight ? "next-race" : undefined}
        className={`${SURFACE_CARD} ${highlight ? "border-brand-navy" : ""}`.trim()}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-brand-navy/70">#{item.number}</span>
          <span className="min-w-0 break-words text-base font-semibold text-brand-navy">{race.label}</span>
          {race.round ? (
            <span className="rounded-full bg-brand-ice px-2 py-0.5 text-xs text-brand-navy">
              {t(locale, "raceDay.schedule.round", { round: race.round })}
            </span>
          ) : null}
          {race.heat ? (
            <span className="rounded-full bg-brand-ice px-2 py-0.5 text-xs text-brand-navy">
              {t(locale, "raceDay.schedule.heat", { heat: race.heat })}
            </span>
          ) : null}
          <VerificationBadge verification={race.verification} />
          {item.involvesSelf ? (
            <StatusTag tone="brand">{t(locale, "raceDay.today.race.mine")}</StatusTag>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-brand-navy">
          {race.scheduledAt
            ? formatRaceTime(race.scheduledAt, locale, event.timeZone)
            : t(locale, "raceDay.schedule.timeUnknown")}
        </p>
        <p className="mt-1 text-sm text-brand-navy/70">
          {race.rosterIds.length === 0
            ? t(locale, "raceDay.schedule.noAthletes")
            : race.rosterIds
                .map((id) => nameById.get(id) ?? t(locale, "raceDay.schedule.unknownAthlete"))
                .join(", ")}
        </p>
        <p className="mt-1 text-sm text-brand-navy/70">
          {item.hasResult ? t(locale, "raceDay.today.race.hasResult") : t(locale, "raceDay.today.race.noResult")}
        </p>
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words text-base font-semibold text-brand-navy">{event.name}</span>
          <VerificationBadge verification={event.verification} />
        </div>
        {event.dates.length > 0 ? (
          <p className="text-sm text-brand-navy/70">
            {t(locale, "raceDay.today.dates", {
              dates: formatRaceDays(event.dates, locale),
            })}
          </p>
        ) : null}
        <p className="text-sm text-brand-navy/70">
          {event.timeZone
            ? t(locale, "raceDay.today.timeZone", { zone: event.timeZone })
            : t(locale, "raceDay.today.timeZoneUnknown")}
        </p>
      </div>

      <FormMessage tone="info">{phaseText}</FormMessage>

      {view.scope === "all" ? <FormMessage tone="info">{t(locale, "raceDay.today.scopeAll")}</FormMessage> : null}
      {multipleSelfName ? (
        <FormMessage tone="info">{t(locale, "raceDay.today.multipleSelf", { name: multipleSelfName })}</FormMessage>
      ) : null}

      {view.pendingResultCount > 0 ? (
        <div data-testid="pending-banner" role="status" className="rounded-card border-2 border-brand-energy bg-status-pending-tint p-4">
          <p className="text-lg font-bold text-brand-navy">
            {t(locale, "raceDay.today.pending", { count: view.pendingResultCount })}
          </p>
          <p className="mt-1 text-sm text-brand-navy">{t(locale, "raceDay.today.pendingHelp")}</p>
          <Link to="/race-day/results" className={SECONDARY_BUTTON + " mt-3"}>
            {t(locale, "raceDay.tab.results")}
          </Link>
        </div>
      ) : null}

      {view.shownDay ? (
        <>
          <section aria-labelledby="today-next-heading" className="space-y-2">
            <h2 id="today-next-heading" className="text-lg font-semibold text-brand-navy">
              {t(locale, "raceDay.today.next.title")}
            </h2>
            {next ? (
              <ul className="space-y-3">{raceRow(next, true)}</ul>
            ) : (
              <p className="text-sm text-brand-navy/70">
                {view.next.kind === "allDone"
                  ? t(locale, "raceDay.today.next.allDone")
                  : view.next.kind === "noneForSelf"
                    ? t(locale, "raceDay.today.next.noneForSelf")
                    : t(locale, "raceDay.today.next.noRaces")}
              </p>
            )}
            <p className="text-xs text-brand-navy/70">{t(locale, "raceDay.today.next.rule")}</p>
          </section>

          {view.races.length > 0 ? (
            <section aria-labelledby="today-races-heading" className="space-y-2">
              <h2 id="today-races-heading" className="text-lg font-semibold text-brand-navy">
                {t(locale, "raceDay.today.races.title", { day: formatRaceDay(view.shownDay, locale) })}
              </h2>
              <ul className="space-y-3">{view.races.map((item) => raceRow(item, false))}</ul>
            </section>
          ) : null}
        </>
      ) : null}

      {view.undatedRaceCount > 0 ? (
        <FormMessage tone="info">{t(locale, "raceDay.today.undated", { count: view.undatedRaceCount })}</FormMessage>
      ) : null}

      <nav aria-label={t(locale, "raceDay.today.go.title")} className="flex flex-wrap gap-2">
        <Link to="/race-day/schedule" className={PRIMARY_BUTTON}>
          {t(locale, "raceDay.tab.schedule")}
        </Link>
        <Link to="/race-day/results" className={SECONDARY_BUTTON}>
          {t(locale, "raceDay.tab.results")}
        </Link>
        <Link to="/race-day/summary" className={SECONDARY_BUTTON}>
          {t(locale, "raceDay.tab.summary")}
        </Link>
      </nav>
    </div>
  );
}
