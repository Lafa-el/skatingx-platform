import type { RaceEvent, RaceRosterEntry } from "@skatingx/schema";
import type { RaceEventInput, RosterEntryInput } from "@skatingx/skating-domain";
import { useMemo, useState } from "react";

import { useActiveAthlete } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";

import { VerificationBadge } from "../components/VerificationBadge";
import {
  DANGER_BUTTON,
  FormMessage,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "../components/fields";
import { useActiveEventId } from "../hooks/useActiveEvent";
import { useRaceDayActions } from "../hooks/useRaceDayActions";
import { useRaceDayContext, useRaceEvents, useRoster } from "../hooks/useRaceDayData";
import { useSubmitState } from "../hooks/useSubmitState";
import { t } from "../i18n/messages";
import { loadErrorMessageKey } from "../lib/errors";
import type { WriteOutcome } from "../lib/write";
import { EventForm } from "../setup/EventForm";
import { RosterForm } from "../setup/RosterForm";
import { RosterList } from "../setup/RosterList";

function eventToInput(event: RaceEvent): RaceEventInput {
  return {
    name: event.name,
    dates: event.dates,
    timeZone: event.timeZone,
    venue: event.venue,
    sourceNote: event.sourceNote,
  };
}

function rosterToInput(entry: RaceRosterEntry): RosterEntryInput {
  return {
    displayName: entry.displayName,
    bib: entry.bib,
    division: entry.division,
    isSelf: entry.isSelf,
    isFollowed: entry.isFollowed,
    athleteRefId: entry.athleteRefId,
    sourceNote: entry.sourceNote,
  };
}

type RosterPanel = { kind: "closed" } | { kind: "create" } | { kind: "edit"; entry: RaceRosterEntry };

/** Setup tab: choose or create the event, then enter its roster by hand. */
export function SetupPage() {
  const locale = useLocale();
  const ctx = useRaceDayContext();
  const events = useRaceEvents(ctx);
  const { storedId, setStoredId } = useActiveEventId();
  const { actions, syncFailed, clearSyncFailed } = useRaceDayActions(ctx);
  const { athleteId: selfAthleteId } = useActiveAthlete();

  const sortedEvents = useMemo(
    () =>
      [...events.items].sort(
        (a, b) => a.name.localeCompare(b.name, locale) || a.eventId.localeCompare(b.eventId),
      ),
    [events.items, locale],
  );
  const activeEvent = sortedEvents.find((e) => e.eventId === storedId) ?? sortedEvents[0] ?? null;
  const roster = useRoster(ctx, activeEvent?.eventId ?? null);

  const [eventPanel, setEventPanel] = useState<"closed" | "create" | "edit">("closed");
  const [rosterPanel, setRosterPanel] = useState<RosterPanel>({ kind: "closed" });
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  const [queued, setQueued] = useState(false);

  const eventSubmit = useSubmitState("saveEvent");
  const rosterSubmit = useSubmitState("saveRoster");
  const rowAction = useSubmitState("rowAction");

  function afterWrite(outcome: WriteOutcome | null): boolean {
    if (outcome === null) {
      return false;
    }
    setQueued(outcome.kind === "queued");
    return true;
  }

  const heading = (
    <h1 className="text-2xl font-bold text-slate-900">{t(locale, "raceDay.tab.setup")}</h1>
  );

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
        <FormMessage tone="error">
          {t(locale, loadErrorMessageKey(events.error?.code ?? ""))}
        </FormMessage>
      </div>
    );
  }

  const invalidCount = events.invalid.length + roster.invalid.length;
  const showEventForm = sortedEvents.length === 0 || eventPanel !== "closed";

  async function handleCreateEvent(values: RaceEventInput) {
    const result = await eventSubmit.submit(async () => {
      const created = await actions!.createEvent(values);
      setStoredId(created.eventId);
      return created.outcome;
    });
    if (afterWrite(result)) {
      setEventPanel("closed");
    }
  }

  async function handleUpdateEvent(eventId: string, values: RaceEventInput) {
    const result = await eventSubmit.submit(() => actions!.updateEvent(eventId, values));
    if (afterWrite(result)) {
      setEventPanel("closed");
    }
  }

  async function handleDeleteEvent(eventId: string) {
    const result = await rowAction.submit(() => actions!.deleteEvent(eventId));
    if (afterWrite(result)) {
      setConfirmDeleteEvent(false);
      setRosterPanel({ kind: "closed" });
    }
  }

  async function handleSaveRoster(eventId: string, values: RosterEntryInput) {
    const result = await rosterSubmit.submit(() =>
      rosterPanel.kind === "edit"
        ? actions!.updateRoster(eventId, rosterPanel.entry.rosterId, values)
        : actions!.createRoster(eventId, values),
    );
    if (afterWrite(result)) {
      setRosterPanel({ kind: "closed" });
    }
  }

  return (
    <div className="space-y-6">
      {heading}
      {syncFailed ? (
        <div className="space-y-2">
          <FormMessage tone="error">{t(locale, "raceDay.state.syncFailed")}</FormMessage>
          <button type="button" className={SECONDARY_BUTTON} onClick={clearSyncFailed}>
            {t(locale, "raceDay.common.dismiss")}
          </button>
        </div>
      ) : null}
      {queued ? <FormMessage tone="info">{t(locale, "raceDay.state.queued")}</FormMessage> : null}
      {rowAction.errorKey ? (
        <FormMessage tone="error">{t(locale, rowAction.errorKey)}</FormMessage>
      ) : null}
      {invalidCount > 0 ? (
        <FormMessage tone="info">{t(locale, "raceDay.state.invalidHidden", { count: invalidCount })}</FormMessage>
      ) : null}

      <section aria-labelledby="race-day-setup-event" className="space-y-3">
        <h2 id="race-day-setup-event" className="text-xl font-semibold text-slate-900">
          {t(locale, "raceDay.setup.event.title")}
        </h2>

        {sortedEvents.length === 0 ? (
          <p className="text-sm text-slate-600">{t(locale, "raceDay.setup.event.empty")}</p>
        ) : null}

        {sortedEvents.length > 1 ? (
          <label className="block text-sm font-medium text-slate-800">
            {t(locale, "raceDay.setup.event.current")}
            <select
              value={activeEvent?.eventId ?? ""}
              onChange={(event) => {
                setStoredId(event.target.value);
                setRosterPanel({ kind: "closed" });
                setConfirmDeleteEvent(false);
              }}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
            >
              {sortedEvents.map((e) => (
                <option key={e.eventId} value={e.eventId}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {activeEvent && !showEventForm ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-slate-900">{activeEvent.name}</span>
              <VerificationBadge verification={activeEvent.verification} />
            </div>
            <p className="text-sm text-slate-600">
              {t(locale, "raceDay.setup.event.dates", { dates: activeEvent.dates.join(", ") })}
            </p>
            {confirmDeleteEvent ? (
              <div className="space-y-2">
                <FormMessage tone="error">{t(locale, "raceDay.setup.event.deleteWarning")}</FormMessage>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={DANGER_BUTTON}
                    disabled={rowAction.saving}
                    onClick={() => {
                      void handleDeleteEvent(activeEvent.eventId);
                    }}
                  >
                    {t(locale, "raceDay.common.confirmDelete")}
                  </button>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      setConfirmDeleteEvent(false);
                    }}
                  >
                    {t(locale, "raceDay.common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() => {
                    eventSubmit.reset();
                    setEventPanel("edit");
                  }}
                >
                  {t(locale, "raceDay.common.edit")}
                </button>
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={rowAction.saving}
                  onClick={() => {
                    void rowAction
                      .submit(() =>
                        actions.setEventVerified(
                          activeEvent.eventId,
                          activeEvent.verification !== "verified",
                        ),
                      )
                      .then(afterWrite);
                  }}
                >
                  {t(
                    locale,
                    activeEvent.verification === "verified"
                      ? "raceDay.verification.markPending"
                      : "raceDay.verification.markVerified",
                  )}
                </button>
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() => {
                    eventSubmit.reset();
                    setEventPanel("create");
                  }}
                >
                  {t(locale, "raceDay.setup.event.create")}
                </button>
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() => {
                    setConfirmDeleteEvent(true);
                  }}
                >
                  {t(locale, "raceDay.common.delete")}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {showEventForm ? (
          eventPanel === "edit" && activeEvent ? (
            <EventForm
              key={`edit-${activeEvent.eventId}`}
              mode="edit"
              initial={eventToInput(activeEvent)}
              saving={eventSubmit.saving}
              submitErrorKey={eventSubmit.errorKey}
              onSubmit={(values) => {
                void handleUpdateEvent(activeEvent.eventId, values);
              }}
              onCancel={() => {
                setEventPanel("closed");
              }}
            />
          ) : (
            <EventForm
              key="create"
              mode="create"
              saving={eventSubmit.saving}
              submitErrorKey={eventSubmit.errorKey}
              onSubmit={(values) => {
                void handleCreateEvent(values);
              }}
              onCancel={
                sortedEvents.length > 0
                  ? () => {
                      setEventPanel("closed");
                    }
                  : undefined
              }
            />
          )
        ) : null}
      </section>

      {activeEvent ? (
        <section aria-labelledby="race-day-setup-roster" className="space-y-3">
          <h2 id="race-day-setup-roster" className="text-xl font-semibold text-slate-900">
            {t(locale, "raceDay.setup.roster.title")}
          </h2>

          {roster.status === "error" ? (
            <FormMessage tone="error">
              {t(locale, loadErrorMessageKey(roster.error?.code ?? ""))}
            </FormMessage>
          ) : roster.status === "loading" ? (
            <p role="status" className="text-sm text-slate-600">
              {t(locale, "raceDay.state.notReady")}
            </p>
          ) : (
            <RosterList
              entries={roster.items}
              busy={rowAction.saving}
              onEdit={(entry) => {
                rosterSubmit.reset();
                setRosterPanel({ kind: "edit", entry });
              }}
              onSetVerified={(entry, verified) => {
                void rowAction
                  .submit(() => actions.setRosterVerified(activeEvent.eventId, entry.rosterId, verified))
                  .then(afterWrite);
              }}
              onDelete={(entry) => {
                void rowAction
                  .submit(() => actions.deleteRoster(activeEvent.eventId, entry.rosterId))
                  .then(afterWrite);
              }}
            />
          )}

          {rosterPanel.kind === "closed" ? (
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => {
                rosterSubmit.reset();
                setRosterPanel({ kind: "create" });
              }}
            >
              {t(locale, "raceDay.setup.roster.add")}
            </button>
          ) : (
            <RosterForm
              key={rosterPanel.kind === "edit" ? rosterPanel.entry.rosterId : "create"}
              mode={rosterPanel.kind}
              initial={rosterPanel.kind === "edit" ? rosterToInput(rosterPanel.entry) : undefined}
              selfAthleteId={selfAthleteId}
              saving={rosterSubmit.saving}
              submitErrorKey={rosterSubmit.errorKey}
              onSubmit={(values) => {
                void handleSaveRoster(activeEvent.eventId, values);
              }}
              onCancel={() => {
                setRosterPanel({ kind: "closed" });
              }}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
