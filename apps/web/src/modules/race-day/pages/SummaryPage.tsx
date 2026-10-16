import { buildRaceSummary } from "@skatingx/skating-domain";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";

import { EventPicker } from "../components/EventPicker";
import { FormMessage, PRIMARY_BUTTON } from "../components/fields";
import { ProGate } from "../components/ProGate";
import { VerificationBadge } from "../components/VerificationBadge";
import { WriteNotices } from "../components/WriteNotices";
import { useSelectedEvent } from "../hooks/useActiveEvent";
import { useRaceDayActions } from "../hooks/useRaceDayActions";
import {
  useRaceDayContext,
  useRaceEvents,
  useRaceResults,
  useRaceSummary,
  useRaces,
  useRoster,
} from "../hooks/useRaceDayData";
import { useSubmitState } from "../hooks/useSubmitState";
import { t } from "../i18n/messages";
import { loadErrorMessageKey } from "../lib/errors";
import { pickSelfAthlete, raceNumberById } from "../lib/summary";
import type { WriteOutcome } from "../lib/write";
import { SummaryCard } from "../summary/SummaryCard";
import { SummaryNote } from "../summary/SummaryNote";

/**
 * Summary tab (PRO): a card computed from the races and results already entered, plus one
 * optional note written by the user. No result is added, changed or guessed here.
 */
export function SummaryPage() {
  return (
    <ProGate titleKey="raceDay.tab.summary">
      <SummaryContent />
    </ProGate>
  );
}

/** Mounted only behind the gate, so no summary or result listener exists for a locked user. */
function SummaryContent() {
  const locale = useLocale();
  const ctx = useRaceDayContext();
  const events = useRaceEvents(ctx);
  const { sortedEvents, activeEvent, selectEvent } = useSelectedEvent(events.items, locale);
  const eventId = activeEvent?.eventId ?? null;
  const roster = useRoster(ctx, eventId);
  const races = useRaces(ctx, eventId);
  const results = useRaceResults(ctx, eventId);
  const summaryDoc = useRaceSummary(ctx, eventId);
  const { actions, syncFailed, clearSyncFailed } = useRaceDayActions(ctx);

  const [queued, setQueued] = useState(false);
  const noteSubmit = useSubmitState("saveSummaryNote");
  const rowAction = useSubmitState("deleteSummary");

  const { self, selfCount } = useMemo(() => pickSelfAthlete(roster.items), [roster.items]);
  const summary = useMemo(
    () => (self ? buildRaceSummary({ self, races: races.items, results: results.items }) : null),
    [self, races.items, results.items],
  );
  const numbers = useMemo(() => raceNumberById(races.items), [races.items]);

  const heading = <h1 className="text-2xl font-bold text-slate-900">{t(locale, "raceDay.tab.summary")}</h1>;

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
        <p className="text-sm text-slate-600">{t(locale, "raceDay.summary.noEvent")}</p>
        <Link to="/race-day/setup" className={PRIMARY_BUTTON}>
          {t(locale, "raceDay.schedule.goSetup")}
        </Link>
      </div>
    );
  }

  const invalidCount =
    events.invalid.length + races.invalid.length + roster.invalid.length + results.invalid.length;
  const loading = [races, roster, results, summaryDoc].some((list) => list.status === "loading");
  const failed = [races, roster, results, summaryDoc].find((list) => list.status === "error");

  const writes = actions;
  const docState = summaryDoc.state;

  async function saveNote(note: string): Promise<boolean> {
    if (!activeEvent) {
      return false;
    }
    const outcome = await noteSubmit.submit(() =>
      writes.saveSummaryNote(activeEvent.eventId, note, docState?.kind === "ready"),
    );
    return afterWrite(outcome);
  }

  async function deleteNote(): Promise<boolean> {
    if (!activeEvent) {
      return false;
    }
    noteSubmit.reset();
    const outcome = await rowAction.submit(() => writes.deleteSummary(activeEvent.eventId));
    return afterWrite(outcome);
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
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-slate-900 min-w-0 break-words">{activeEvent.name}</span>
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
          {summary && self ? (
            <>
              {selfCount > 1 ? (
                <FormMessage tone="info">{t(locale, "raceDay.summary.multipleSelf", { name: self.displayName })}</FormMessage>
              ) : null}
              <SummaryCard summary={summary} raceNumbers={numbers} />
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{t(locale, "raceDay.summary.noSelf")}</p>
              <Link to="/race-day/setup" className={PRIMARY_BUTTON}>
                {t(locale, "raceDay.schedule.goSetup")}
              </Link>
            </div>
          )}

          <SummaryNote
            key={activeEvent.eventId}
            saved={docState?.kind === "ready" ? docState.summary : null}
            unreadable={docState?.kind === "invalid"}
            timeZone={activeEvent.timeZone}
            saving={noteSubmit.saving}
            deleting={rowAction.saving}
            submitErrorKey={noteSubmit.errorKey}
            onSave={saveNote}
            onDelete={deleteNote}
          />
        </>
      )}
    </div>
  );
}
