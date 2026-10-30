import type { RaceResultStatus } from "@skatingx/schema";
import { formatResultTime } from "@skatingx/skating-domain";
import { Card, ErrorNotice, StatusTag } from "@skatingx/ui";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  useRaceOverview,
  type RaceOverviewNext,
  type RaceOverviewPrevious,
} from "@/hooks/useRaceOverview";
import { useLocale } from "@/hooks/useLocale";
import { type DashboardMessageKey, tDashboard } from "@/shared/i18n/dashboard-messages";
import { formatCalendarDate } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/translator";

/**
 * Dashboard card: the next and the previous Race Day event, read-only. It writes nothing.
 *
 * Mount it only when `isRaceDayEnabled()`: the data hook subscribes as soon as it renders. Its
 * wording lives in the dashboard text pack, so the lazy Race Day module stays out of the main
 * bundle. Everything shown here is something the Race Day results page already shows for free.
 */

const LINK_CLASS =
  "text-sm font-semibold text-brand-navy underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy " +
  // The whole block is the click target; the link text stays short for screen readers.
  "after:absolute after:inset-0 after:rounded-control after:content-['']";

const RESULT_STATUS_KEY = {
  finished: "dashboard.race.result.finished",
  DNS: "dashboard.race.result.DNS",
  DNF: "dashboard.race.result.DNF",
  DQ: "dashboard.race.result.DQ",
} as const satisfies Record<RaceResultStatus, DashboardMessageKey>;

const BLOCK_CLASS = "relative min-w-0 rounded-control border border-brand-navy/10 bg-white p-3";

function dateText(first: string, last: string, locale: Locale): string {
  return first === last
    ? formatCalendarDate(first, locale)
    : tDashboard(locale, "dashboard.race.dateRange", {
        from: formatCalendarDate(first, locale),
        to: formatCalendarDate(last, locale),
      });
}

function Block({
  title,
  headingId,
  children,
}: {
  title: string;
  headingId: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={headingId} className={BLOCK_CLASS}>
      <h4 id={headingId} className="text-xs font-semibold uppercase tracking-wide text-brand-navy/70">
        {title}
      </h4>
      <div className="mt-2 space-y-1">{children}</div>
    </section>
  );
}

function EventHeader({
  name,
  pending,
  locale,
}: {
  name: string;
  pending: boolean;
  locale: Locale;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="min-w-0 break-words text-base font-semibold text-brand-navy">{name}</p>
      {pending ? <StatusTag tone="pending">{tDashboard(locale, "dashboard.race.eventPending")}</StatusTag> : null}
    </div>
  );
}

function NextBlock({ next, locale }: { next: RaceOverviewNext; locale: Locale }) {
  const { pick, division, detail } = next;
  const { event } = pick;
  return (
    <Block title={tDashboard(locale, "dashboard.race.next.title")} headingId="dashboard-race-next">
      <EventHeader name={event.name} pending={event.verification !== "verified"} locale={locale} />
      <p className="text-sm text-brand-navy">{dateText(pick.firstDay, pick.lastDay, locale)}</p>
      {pick.status === "ongoing" || pick.daysUntil !== null || !pick.zoneKnown ? (
        <div className="flex flex-wrap items-center gap-2">
        {pick.status === "ongoing" ? (
          <StatusTag tone="brand">{tDashboard(locale, "dashboard.race.ongoing")}</StatusTag>
        ) : null}
        {pick.daysUntil !== null ? (
          <StatusTag tone="neutral">
            {tDashboard(
              locale,
              pick.daysUntil === 1 ? "dashboard.race.countdown.one" : "dashboard.race.countdown.other",
              { days: pick.daysUntil },
            )}
          </StatusTag>
        ) : null}
        {pick.zoneKnown ? null : (
          <StatusTag tone="pending">{tDashboard(locale, "dashboard.race.zonePending")}</StatusTag>
        )}
        </div>
      ) : null}
      {event.venue ? (
        <p className="text-sm text-brand-navy">{tDashboard(locale, "dashboard.race.venue", { venue: event.venue })}</p>
      ) : null}
      {division ? (
        <p className="text-sm text-brand-navy">{tDashboard(locale, "dashboard.race.division", { division })}</p>
      ) : null}
      {detail === "error" ? (
        <p className="text-sm text-status-danger">{tDashboard(locale, "dashboard.race.next.error")}</p>
      ) : null}
      <p className="pt-1">
        <Link to="/race-day" className={LINK_CLASS}>
          {tDashboard(locale, "dashboard.race.next.open")}
        </Link>
      </p>
    </Block>
  );
}

function PreviousBlock({ previous, locale }: { previous: RaceOverviewPrevious; locale: Locale }) {
  const { pick, results, detail } = previous;
  const { event } = pick;
  return (
    <Block title={tDashboard(locale, "dashboard.race.previous.title")} headingId="dashboard-race-previous">
      <EventHeader name={event.name} pending={event.verification !== "verified"} locale={locale} />
      <p className="text-sm text-brand-navy">{dateText(pick.firstDay, pick.lastDay, locale)}</p>
      {pick.zoneKnown ? null : (
        <StatusTag tone="pending">{tDashboard(locale, "dashboard.race.zonePending")}</StatusTag>
      )}
      {detail === "error" ? (
        <p className="text-sm text-status-danger">{tDashboard(locale, "dashboard.race.previous.error")}</p>
      ) : detail === "loading" ? (
        <p role="status" className="text-sm text-brand-navy/70">
          {tDashboard(locale, "dashboard.race.results.loading")}
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-brand-navy/70">{tDashboard(locale, "dashboard.race.results.empty")}</p>
      ) : (
        <ul className="space-y-2 pt-1">
          {results.map(({ result, race }) => {
            const verified = result.verification === "verified";
            return (
              <li key={result.resultId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 break-words text-sm text-brand-navy">{race.label}</span>
                {result.status === "finished" && result.timeSeconds !== null ? (
                  <span className="sx-numeric text-base text-brand-navy">{formatResultTime(result.timeSeconds)}</span>
                ) : (
                  <span className="text-sm font-semibold text-brand-navy">
                    {tDashboard(locale, RESULT_STATUS_KEY[result.status])}
                  </span>
                )}
                {result.place !== null ? (
                  <span className="text-sm text-brand-navy">
                    {tDashboard(locale, "dashboard.race.result.place", { place: result.place })}
                  </span>
                ) : null}
                <StatusTag tone={verified ? "success" : "pending"} data-verification={verified ? "verified" : "pending"}>
                  {tDashboard(locale, verified ? "dashboard.race.verification.verified" : "dashboard.race.verification.pending")}
                </StatusTag>
              </li>
            );
          })}
        </ul>
      )}
      <p className="pt-1">
        <Link to="/race-day/results" className={LINK_CLASS}>
          {tDashboard(locale, "dashboard.race.previous.open")}
        </Link>
      </p>
    </Block>
  );
}

function EmptyBlock({
  title,
  headingId,
  text,
}: {
  title: string;
  headingId: string;
  text: string;
}) {
  return (
    <Block title={title} headingId={headingId}>
      <p className="text-sm text-brand-navy/70">{text}</p>
    </Block>
  );
}

export function RaceOverviewCard() {
  const locale = useLocale();
  const overview = useRaceOverview();
  const title = tDashboard(locale, "dashboard.card.race");

  let body: ReactNode;
  if (overview.status === "loading") {
    body = (
      <p role="status" className="text-sm text-brand-navy/70">
        {tDashboard(locale, "dashboard.race.loading")}
      </p>
    );
  } else if (overview.status === "error") {
    // A failed read is never shown as "no events": the user could not tell the two apart.
    body = (
      <ErrorNotice>
        {tDashboard(locale, overview.permissionDenied ? "dashboard.race.error.permission" : "dashboard.race.error.load")}
      </ErrorNotice>
    );
  } else if (overview.eventCount === 0 && overview.hiddenCount === 0) {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-brand-navy/70">{tDashboard(locale, "dashboard.race.empty")}</p>
        <Link to="/race-day/setup" className="text-sm font-semibold text-brand-navy underline underline-offset-2">
          {tDashboard(locale, "dashboard.race.empty.setup")}
        </Link>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          {overview.next ? (
            <NextBlock next={overview.next} locale={locale} />
          ) : (
            <EmptyBlock
              title={tDashboard(locale, "dashboard.race.next.title")}
              headingId="dashboard-race-next"
              text={tDashboard(locale, "dashboard.race.next.empty")}
            />
          )}
          {overview.previous ? (
            <PreviousBlock previous={overview.previous} locale={locale} />
          ) : (
            <EmptyBlock
              title={tDashboard(locale, "dashboard.race.previous.title")}
              headingId="dashboard-race-previous"
              text={tDashboard(locale, "dashboard.race.previous.empty")}
            />
          )}
        </div>
        {overview.hiddenCount > 0 ? (
          <p className="text-xs text-brand-navy/70">
            {tDashboard(locale, "dashboard.race.hidden", { count: overview.hiddenCount })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Card variant="raised" title={title} className="sm:col-span-2 lg:col-span-3">
      {body}
    </Card>
  );
}
