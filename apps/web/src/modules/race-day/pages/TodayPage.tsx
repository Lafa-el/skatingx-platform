import { buildTodayView } from "@skatingx/skating-domain";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";

import { EventPicker } from "../components/EventPicker";
import { FormMessage, PRIMARY_BUTTON } from "../components/fields";
import { useSelectedEvent } from "../hooks/useActiveEvent";
import { useNowIso } from "../hooks/useNowIso";
import { useRaceDayContext, useRaceEvents, useRaceResults, useRaces, useRoster } from "../hooks/useRaceDayData";
import { t } from "../i18n/messages";
import { loadErrorMessageKey } from "../lib/errors";
import { pickSelfAthlete } from "../lib/summary";
import { TodayBoard } from "../today/TodayBoard";

/**
 * Today tab: a read-only view of what is happening on the event's current day. It writes
 * nothing, is open to every user (no PRO gate) and only arranges what the other tabs hold.
 */
export function TodayPage() {
  const locale = useLocale();
  const ctx = useRaceDayContext();
  const events = useRaceEvents(ctx);
  const { sortedEvents, activeEvent, selectEvent } = useSelectedEvent(events.items, locale);
  const eventId = activeEvent?.eventId ?? null;
  const roster = useRoster(ctx, eventId);
  const races = useRaces(ctx, eventId);
  const results = useRaceResults(ctx, eventId);
  const now = useNowIso();

  const { self, selfCount } = useMemo(() => pickSelfAthlete(roster.items), [roster.items]);
  const view = useMemo(
    () =>
      activeEvent
        ? buildTodayView({ event: activeEvent, races: races.items, results: results.items, self, now })
        : null,
    [activeEvent, races.items, results.items, self, now],
  );

  const heading = <h1 className="text-2xl font-bold text-brand-navy">{t(locale, "raceDay.tab.today")}</h1>;

  if (!ctx || events.status === "loading") {
    return (
      <div className="space-y-4">
        {heading}
        <p role="status" className="text-sm text-brand-navy/70">
          {t(locale, "raceDay.state.notReady")}
        </p>
      </div>
    );
  }

  if (events.status === "error") {
    return (
      <div className="space-y-4">
        {heading}
        <FormMessage tone="error">{t(locale, loadErrorMessageKey(events.error?.code ?? ""))}</FormMessage>
      </div>
    );
  }

  if (!activeEvent || !view) {
    return (
      <div className="space-y-4">
        {heading}
        <p className="text-sm text-brand-navy/70">{t(locale, "raceDay.today.noEvent")}</p>
        <Link to="/race-day/setup" className={PRIMARY_BUTTON}>
          {t(locale, "raceDay.schedule.goSetup")}
        </Link>
      </div>
    );
  }

  const invalidCount =
    events.invalid.length + races.invalid.length + roster.invalid.length + results.invalid.length;
  const loading = [races, roster, results].some((list) => list.status === "loading");
  const failed = [races, roster, results].find((list) => list.status === "error");

  return (
    <div className="space-y-6">
      {heading}
      {invalidCount > 0 ? (
        <FormMessage tone="info">{t(locale, "raceDay.state.invalidHidden", { count: invalidCount })}</FormMessage>
      ) : null}

      <EventPicker
        events={sortedEvents}
        activeEventId={activeEvent.eventId}
        onChange={(id) => {
          selectEvent(id);
        }}
      />

      {loading ? (
        <p role="status" className="text-sm text-brand-navy/70">
          {t(locale, "raceDay.state.notReady")}
        </p>
      ) : failed ? (
        <FormMessage tone="error">{t(locale, loadErrorMessageKey(failed.error?.code ?? ""))}</FormMessage>
      ) : (
        <TodayBoard
          event={activeEvent}
          view={view}
          roster={roster.items}
          multipleSelfName={selfCount > 1 && self ? self.displayName : null}
        />
      )}
    </div>
  );
}
