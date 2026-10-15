import { sortRaceEntries, type RaceResultFormInput } from "@skatingx/skating-domain";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";

import { EventPicker } from "../components/EventPicker";
import { FormMessage, PRIMARY_BUTTON, SelectField } from "../components/fields";
import { VerificationBadge } from "../components/VerificationBadge";
import { WriteNotices } from "../components/WriteNotices";
import { useSelectedEvent } from "../hooks/useActiveEvent";
import { useRaceDayActions } from "../hooks/useRaceDayActions";
import {
  useRaceDayContext,
  useRaceEvents,
  useRaceResults,
  useRaces,
  useRoster,
} from "../hooks/useRaceDayData";
import { useSubmitState } from "../hooks/useSubmitState";
import { t } from "../i18n/messages";
import { loadErrorMessageKey } from "../lib/errors";
import { buildResultViews, resultIdFor, resultToFormValues, type ResultView } from "../lib/results";
import type { WriteOutcome } from "../lib/write";
import { ResultForm } from "../results/ResultForm";
import { ResultList } from "../results/ResultList";

type Selection = { raceId: string; rosterId: string; fromEdit: boolean };
const NOTHING_SELECTED: Selection = { raceId: "", rosterId: "", fromEdit: false };

/**
 * Results tab: results are typed in by hand, one per race and athlete, and shown in a feed that
 * updates as soon as they are saved. Nothing is parsed, computed or pushed; every result starts
 * as "pending" until someone checks it against the official source.
 */
export function ResultsPage() {
  const locale = useLocale();
  const ctx = useRaceDayContext();
  const events = useRaceEvents(ctx);
  const { sortedEvents, activeEvent, selectEvent } = useSelectedEvent(events.items, locale);
  const eventId = activeEvent?.eventId ?? null;
  const roster = useRoster(ctx, eventId);
  const races = useRaces(ctx, eventId);
  const results = useRaceResults(ctx, eventId);
  const { actions, syncFailed, clearSyncFailed } = useRaceDayActions(ctx);

  const [selection, setSelection] = useState<Selection>(NOTHING_SELECTED);
  const [queued, setQueued] = useState(false);
  const resultSubmit = useSubmitState("saveResult");
  const rowAction = useSubmitState("resultRowAction");

  const sortedRaces = useMemo(() => sortRaceEntries(races.items), [races.items]);
  const views = useMemo(
    () => buildResultViews(results.items, races.items, roster.items),
    [results.items, races.items, roster.items],
  );

  const heading = <h1 className="text-2xl font-bold text-slate-900">{t(locale, "raceDay.tab.results")}</h1>;

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
        <p className="text-sm text-slate-600">{t(locale, "raceDay.results.noEvent")}</p>
        <Link to="/race-day/setup" className={PRIMARY_BUTTON + " inline-block"}>
          {t(locale, "raceDay.schedule.goSetup")}
        </Link>
      </div>
    );
  }

  const invalidCount =
    events.invalid.length + races.invalid.length + roster.invalid.length + results.invalid.length;
  const loading = races.status === "loading" || roster.status === "loading" || results.status === "loading";
  const failed = [races, roster, results].find((list) => list.status === "error");

  const selectedRace = races.items.find((race) => race.raceId === selection.raceId) ?? null;
  const nameById = new Map(roster.items.map((entry) => [entry.rosterId, entry.displayName]));
  // The athlete of a result being edited stays selectable even if they were taken off the race.
  const athleteIds = selectedRace
    ? [...new Set([...selectedRace.rosterIds, ...(selection.rosterId ? [selection.rosterId] : [])])]
    : [];
  const resultId = resultIdFor(selection.raceId, selection.rosterId);
  const existing = resultId ? results.items.find((r) => r.resultId === resultId) : undefined;

  const writes = actions;

  async function handleSave(input: RaceResultFormInput) {
    if (!activeEvent || !selectedRace) {
      return;
    }
    const { raceId, rosterId } = selection;
    const outcome = await resultSubmit.submit(() =>
      existing
        ? writes.updateResult(activeEvent.eventId, existing.resultId, input)
        : writes.createResult(activeEvent.eventId, raceId, rosterId, input),
    );
    if (afterWrite(outcome)) {
      // Keep the race, clear the athlete: the usual next step is the next athlete in the same race.
      setSelection({ raceId, rosterId: "", fromEdit: false });
    }
  }

  function startEdit(view: ResultView) {
    resultSubmit.reset();
    setSelection({ raceId: view.result.raceId, rosterId: view.result.rosterId, fromEdit: true });
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
          setSelection(NOTHING_SELECTED);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-slate-900">{activeEvent.name}</span>
        <VerificationBadge verification={activeEvent.verification} />
      </div>

      {loading ? (
        <p role="status" className="text-sm text-slate-600">
          {t(locale, "raceDay.state.notReady")}
        </p>
      ) : failed ? (
        <FormMessage tone="error">{t(locale, loadErrorMessageKey(failed.error?.code ?? ""))}</FormMessage>
      ) : (
        <>
          {races.items.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{t(locale, "raceDay.results.needRaces")}</p>
              <Link to="/race-day/schedule" className={PRIMARY_BUTTON + " inline-block"}>
                {t(locale, "raceDay.tab.schedule")}
              </Link>
            </div>
          ) : (
            <section aria-labelledby="results-entry-heading" className="space-y-4">
              <h2 id="results-entry-heading" className="text-lg font-semibold text-slate-900">
                {t(locale, "raceDay.results.entry.title")}
              </h2>
              <SelectField
                label={t(locale, "raceDay.results.form.race")}
                value={selection.raceId}
                options={[
                  { value: "", label: t(locale, "raceDay.results.form.raceChoose") },
                  ...sortedRaces.map((race, index) => ({
                    value: race.raceId,
                    label: `#${String(index + 1)} ${race.label}${race.day ? ` · ${race.day}` : ""}`,
                  })),
                ]}
                onChange={(raceId) => {
                  resultSubmit.reset();
                  setSelection({ raceId, rosterId: "", fromEdit: false });
                }}
              />
              {selectedRace ? (
                athleteIds.length === 0 ? (
                  <FormMessage tone="info">{t(locale, "raceDay.results.form.noAthletes")}</FormMessage>
                ) : (
                  <SelectField
                    label={t(locale, "raceDay.results.form.athlete")}
                    value={selection.rosterId}
                    options={[
                      { value: "", label: t(locale, "raceDay.results.form.athleteChoose") },
                      ...athleteIds.map((id) => ({
                        value: id,
                        label: nameById.get(id) ?? t(locale, "raceDay.results.item.unknownAthlete"),
                      })),
                    ]}
                    onChange={(rosterId) => {
                      resultSubmit.reset();
                      setSelection((prev) => ({ ...prev, rosterId, fromEdit: false }));
                    }}
                  />
                )
              ) : null}
              {selectedRace && selection.rosterId ? (
                <ResultForm
                  key={`${selection.raceId}_${selection.rosterId}`}
                  updatesExisting={existing !== undefined}
                  initial={resultToFormValues(existing)}
                  focusOnMount={selection.fromEdit}
                  saving={resultSubmit.saving}
                  submitErrorKey={resultSubmit.errorKey}
                  onSubmit={(input) => {
                    void handleSave(input);
                  }}
                  onCancel={() => {
                    resultSubmit.reset();
                    setSelection((prev) => ({ ...prev, rosterId: "", fromEdit: false }));
                  }}
                />
              ) : null}
            </section>
          )}

          <section aria-labelledby="results-feed-heading" className="space-y-3">
            <h2 id="results-feed-heading" className="text-lg font-semibold text-slate-900">
              {t(locale, "raceDay.results.feed.title")}
            </h2>
            <p className="text-sm text-slate-500">{t(locale, "raceDay.results.feed.live")}</p>
            {views.length === 0 ? (
              <p className="text-sm text-slate-600">{t(locale, "raceDay.results.feed.empty")}</p>
            ) : (
              <ResultList
                views={views}
                busy={rowAction.saving}
                onEdit={startEdit}
                onSetVerified={(view, verified) => {
                  void rowAction
                    .submit(() => actions.setResultVerified(activeEvent.eventId, view.result.resultId, verified))
                    .then(afterWrite);
                }}
                onDelete={(view) => {
                  void rowAction
                    .submit(() => actions.deleteResult(activeEvent.eventId, view.result.resultId))
                    .then(afterWrite);
                }}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
