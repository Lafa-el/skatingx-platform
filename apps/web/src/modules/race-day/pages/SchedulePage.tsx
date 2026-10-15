import type { RaceEntry } from "@skatingx/schema";
import type { RaceInput } from "@skatingx/skating-domain";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";

import { EventPicker } from "../components/EventPicker";
import { VerificationBadge } from "../components/VerificationBadge";
import { FormMessage, PRIMARY_BUTTON } from "../components/fields";
import { WriteNotices } from "../components/WriteNotices";
import { useSelectedEvent } from "../hooks/useActiveEvent";
import { useRaceDayActions } from "../hooks/useRaceDayActions";
import { useRaceDayContext, useRaceEvents, useRaces, useRoster } from "../hooks/useRaceDayData";
import { useSubmitState } from "../hooks/useSubmitState";
import { t } from "../i18n/messages";
import { loadErrorMessageKey } from "../lib/errors";
import { nextSortOrder } from "../lib/schedule";
import type { WriteOutcome } from "../lib/write";
import { RaceForm } from "../schedule/RaceForm";
import { RaceList } from "../schedule/RaceList";

function raceToInput(race: RaceEntry): RaceInput {
  return {
    distanceId: race.distanceId,
    label: race.label,
    sortOrder: race.sortOrder,
    day: race.day,
    round: race.round,
    heat: race.heat,
    scheduledAt: race.scheduledAt,
    rosterIds: race.rosterIds,
    sourceNote: race.sourceNote,
  };
}

type Panel = { kind: "closed" } | { kind: "create" } | { kind: "edit"; race: RaceEntry };

/** Schedule tab: the races of the current event, entered by hand and marked pending. */
export function SchedulePage() {
  const locale = useLocale();
  const ctx = useRaceDayContext();
  const events = useRaceEvents(ctx);
  const { sortedEvents, activeEvent, selectEvent } = useSelectedEvent(events.items, locale);
  const eventId = activeEvent?.eventId ?? null;
  const roster = useRoster(ctx, eventId);
  const races = useRaces(ctx, eventId);
  const { actions, syncFailed, clearSyncFailed } = useRaceDayActions(ctx);

  const [panel, setPanel] = useState<Panel>({ kind: "closed" });
  const [queued, setQueued] = useState(false);
  const raceSubmit = useSubmitState("saveRace");
  const rowAction = useSubmitState("raceRowAction");

  const heading = <h1 className="text-2xl font-bold text-slate-900">{t(locale, "raceDay.tab.schedule")}</h1>;

  function afterWrite(outcome: WriteOutcome | null): boolean {
    if (outcome === null) {
      return false;
    }
    setQueued(outcome.kind === "queued");
    return true;
  }

  if (!ctx || !actions || events.status === "loading") {
    return (
      <div className="space-y-4">
        {heading}
        <p role="status" className="text-sm text-slate-600">
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

  const notices = (
    <WriteNotices
      syncFailed={syncFailed}
      onDismissSyncFailed={clearSyncFailed}
      queued={queued}
      actionErrorKey={rowAction.errorKey}
    />
  );

  if (!activeEvent) {
    return (
      <div className="space-y-4">
        {heading}
        {notices}
        <p className="text-sm text-slate-600">{t(locale, "raceDay.schedule.noEvent")}</p>
        <Link to="/race-day/setup" className={PRIMARY_BUTTON + " inline-block"}>
          {t(locale, "raceDay.schedule.goSetup")}
        </Link>
      </div>
    );
  }

  const invalidCount = events.invalid.length + races.invalid.length + roster.invalid.length;

  async function handleSave(values: RaceInput) {
    const result = await raceSubmit.submit(() =>
      panel.kind === "edit"
        ? actions!.updateRace(activeEvent!.eventId, panel.race.raceId, values)
        : actions!.createRace(activeEvent!.eventId, values),
    );
    if (afterWrite(result)) {
      setPanel({ kind: "closed" });
    }
  }

  return (
    <div className="space-y-6">
      {heading}
      {notices}
      {invalidCount > 0 ? (
        <FormMessage tone="info">{t(locale, "raceDay.state.invalidHidden", { count: invalidCount })}</FormMessage>
      ) : null}

      <EventPicker
        events={sortedEvents}
        activeEventId={activeEvent.eventId}
        onChange={(id) => {
          selectEvent(id);
          setPanel({ kind: "closed" });
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-slate-900">{activeEvent.name}</span>
        <VerificationBadge verification={activeEvent.verification} />
      </div>

      {activeEvent.timeZone === null ? (
        <FormMessage tone="info">
          {t(locale, "raceDay.schedule.needZone")}{" "}
          <Link to="/race-day/setup" className="font-semibold underline">
            {t(locale, "raceDay.schedule.goSetup")}
          </Link>
        </FormMessage>
      ) : null}

      {races.status === "loading" ? (
        <p role="status" className="text-sm text-slate-600">
          {t(locale, "raceDay.state.notReady")}
        </p>
      ) : races.status === "error" ? (
        <FormMessage tone="error">{t(locale, loadErrorMessageKey(races.error?.code ?? ""))}</FormMessage>
      ) : races.items.length === 0 ? (
        <p className="text-sm text-slate-600">{t(locale, "raceDay.schedule.empty")}</p>
      ) : (
        <RaceList
          races={races.items}
          roster={roster.items}
          timeZone={activeEvent.timeZone}
          busy={rowAction.saving}
          onEdit={(race) => {
            raceSubmit.reset();
            setPanel({ kind: "edit", race });
          }}
          onSetVerified={(race, verified) => {
            void rowAction
              .submit(() => actions.setRaceVerified(activeEvent.eventId, race.raceId, verified))
              .then(afterWrite);
          }}
          onDelete={(race) => {
            void rowAction
              .submit(() => actions.deleteRace(activeEvent.eventId, race.raceId))
              .then(afterWrite);
          }}
        />
      )}

      {races.status === "ready" ? (
        panel.kind === "closed" ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => {
              raceSubmit.reset();
              setPanel({ kind: "create" });
            }}
          >
            {t(locale, "raceDay.schedule.add")}
          </button>
        ) : (
          <RaceForm
            key={panel.kind === "edit" ? panel.race.raceId : "create"}
            mode={panel.kind}
            initial={panel.kind === "edit" ? raceToInput(panel.race) : undefined}
            event={{ dates: activeEvent.dates, timeZone: activeEvent.timeZone }}
            roster={roster.items}
            defaultSortOrder={nextSortOrder(races.items)}
            saving={raceSubmit.saving}
            submitErrorKey={raceSubmit.errorKey}
            onSubmit={(values) => {
              void handleSave(values);
            }}
            onCancel={() => {
              setPanel({ kind: "closed" });
            }}
          />
        )
      ) : null}
    </div>
  );
}
