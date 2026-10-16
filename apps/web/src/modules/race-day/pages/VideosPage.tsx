import { sortRaceEntries, type RaceVideoInput } from "@skatingx/skating-domain";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";

import { EventPicker } from "../components/EventPicker";
import { FormMessage, PRIMARY_BUTTON, SelectField } from "../components/fields";
import { ProGate } from "../components/ProGate";
import { VerificationBadge } from "../components/VerificationBadge";
import { WriteNotices } from "../components/WriteNotices";
import { useSelectedEvent } from "../hooks/useActiveEvent";
import { useRaceDayActions } from "../hooks/useRaceDayActions";
import {
  useRaceDayContext,
  useRaceEvents,
  useRaceVideos,
  useRaces,
  useRoster,
} from "../hooks/useRaceDayData";
import { useSubmitState } from "../hooks/useSubmitState";
import { t } from "../i18n/messages";
import { loadErrorMessageKey } from "../lib/errors";
import { raceOptionLabel } from "../lib/schedule";
import { buildVideoGroups, videoToFormValues, type VideoView } from "../lib/videos";
import type { WriteOutcome } from "../lib/write";
import { VideoForm } from "../videos/VideoForm";
import { VideoList } from "../videos/VideoList";

type Selection = { raceId: string; rosterId: string };
const NOTHING_SELECTED: Selection = { raceId: "", rosterId: "" };

/**
 * Videos tab (PRO). It keeps a list of where each clip is: race, athlete, name, an optional
 * link and where it is kept. Nothing is uploaded, played or analysed.
 */
export function VideosPage() {
  return (
    <ProGate titleKey="raceDay.tab.videos">
      <VideosContent />
    </ProGate>
  );
}

/** Mounted only behind the gate, so the video listener never exists for a locked user. */
function VideosContent() {
  const locale = useLocale();
  const ctx = useRaceDayContext();
  const events = useRaceEvents(ctx);
  const { sortedEvents, activeEvent, selectEvent } = useSelectedEvent(events.items, locale);
  const eventId = activeEvent?.eventId ?? null;
  const roster = useRoster(ctx, eventId);
  const races = useRaces(ctx, eventId);
  const videos = useRaceVideos(ctx, eventId);
  const { actions, syncFailed, clearSyncFailed } = useRaceDayActions(ctx);

  const [selection, setSelection] = useState<Selection>(NOTHING_SELECTED);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Changing the key gives the form fresh fields after a save, since a new record has no id yet.
  const [formKey, setFormKey] = useState(0);
  const [queued, setQueued] = useState(false);
  const videoSubmit = useSubmitState("saveVideo");
  const rowAction = useSubmitState("videoRowAction");

  const sortedRaces = useMemo(() => sortRaceEntries(races.items), [races.items]);
  const groups = useMemo(
    () => buildVideoGroups(videos.items, races.items, roster.items),
    [videos.items, races.items, roster.items],
  );

  const heading = <h1 className="text-2xl font-bold text-slate-900">{t(locale, "raceDay.tab.videos")}</h1>;

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
        <p className="text-sm text-slate-600">{t(locale, "raceDay.videos.noEvent")}</p>
        <Link to="/race-day/setup" className={PRIMARY_BUTTON}>
          {t(locale, "raceDay.schedule.goSetup")}
        </Link>
      </div>
    );
  }

  const invalidCount =
    events.invalid.length + races.invalid.length + roster.invalid.length + videos.invalid.length;
  const loading = races.status === "loading" || roster.status === "loading" || videos.status === "loading";
  const failed = [races, roster, videos].find((list) => list.status === "error");

  const selectedRace = races.items.find((race) => race.raceId === selection.raceId) ?? null;
  const nameById = new Map(roster.items.map((entry) => [entry.rosterId, entry.displayName]));
  const athleteIds = selectedRace ? selectedRace.rosterIds : [];
  const editing = editingId ? videos.items.find((video) => video.videoId === editingId) : undefined;

  const writes = actions;

  async function handleSave(input: RaceVideoInput) {
    if (!activeEvent) {
      return;
    }
    const outcome = await videoSubmit.submit(() =>
      editing
        ? writes.updateVideo(activeEvent.eventId, editing.videoId, input)
        : writes.createVideo(activeEvent.eventId, selection.raceId, selection.rosterId, input),
    );
    if (afterWrite(outcome)) {
      setEditingId(null);
      setSelection((prev) => ({ raceId: prev.raceId, rosterId: "" }));
      setFormKey((key) => key + 1);
    }
  }

  function startEdit(view: VideoView) {
    videoSubmit.reset();
    setEditingId(view.video.videoId);
    setFormKey((key) => key + 1);
  }

  function stopEditing() {
    videoSubmit.reset();
    setEditingId(null);
    setFormKey((key) => key + 1);
  }

  const editingRace = editing ? (races.items.find((race) => race.raceId === editing.raceId) ?? null) : null;

  return (
    <div className="space-y-6">
      {heading}
      {notices}
      <p className="text-sm text-slate-600">{t(locale, "raceDay.videos.intro")}</p>
      {invalidCount > 0 ? (
        <FormMessage tone="info">{t(locale, "raceDay.state.invalidHidden", { count: invalidCount })}</FormMessage>
      ) : null}

      <EventPicker
        events={sortedEvents}
        activeEventId={activeEvent.eventId}
        onChange={(id) => {
          selectEvent(id);
          setSelection(NOTHING_SELECTED);
          setEditingId(null);
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
          {races.items.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{t(locale, "raceDay.videos.needRaces")}</p>
              <Link to="/race-day/schedule" className={PRIMARY_BUTTON}>
                {t(locale, "raceDay.tab.schedule")}
              </Link>
            </div>
          ) : (
            <section aria-labelledby="videos-entry-heading" className="space-y-4">
              <h2 id="videos-entry-heading" className="text-lg font-semibold text-slate-900">
                {t(locale, "raceDay.videos.entry.title")}
              </h2>
              {editing ? (
                <>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-slate-700">
                    <dt className="font-medium">{t(locale, "raceDay.videos.form.race")}</dt>
                    <dd>{editingRace ? editingRace.label : t(locale, "raceDay.videos.item.unknownRace")}</dd>
                    <dt className="font-medium">{t(locale, "raceDay.videos.form.athlete")}</dt>
                    <dd>{nameById.get(editing.rosterId) ?? t(locale, "raceDay.videos.item.unknownAthlete")}</dd>
                  </dl>
                  <VideoForm
                    key={`edit_${editing.videoId}_${String(formKey)}`}
                    editing
                    initial={videoToFormValues(editing)}
                    focusOnMount
                    saving={videoSubmit.saving}
                    submitErrorKey={videoSubmit.errorKey}
                    onSubmit={(input) => {
                      void handleSave(input);
                    }}
                    onCancel={stopEditing}
                  />
                </>
              ) : (
                <>
                  <SelectField
                    label={t(locale, "raceDay.videos.form.race")}
                    value={selection.raceId}
                    options={[
                      { value: "", label: t(locale, "raceDay.videos.form.raceChoose") },
                      ...sortedRaces.map((race, index) => ({
                        value: race.raceId,
                        label: raceOptionLabel(race, index + 1, locale),
                      })),
                    ]}
                    onChange={(raceId) => {
                      videoSubmit.reset();
                      setSelection({ raceId, rosterId: "" });
                    }}
                  />
                  {selectedRace ? (
                    athleteIds.length === 0 ? (
                      <FormMessage tone="info">{t(locale, "raceDay.videos.form.noAthletes")}</FormMessage>
                    ) : (
                      <SelectField
                        label={t(locale, "raceDay.videos.form.athlete")}
                        value={selection.rosterId}
                        options={[
                          { value: "", label: t(locale, "raceDay.videos.form.athleteChoose") },
                          ...athleteIds.map((id) => ({
                            value: id,
                            label: nameById.get(id) ?? t(locale, "raceDay.videos.item.unknownAthlete"),
                          })),
                        ]}
                        onChange={(rosterId) => {
                          videoSubmit.reset();
                          setSelection((prev) => ({ ...prev, rosterId }));
                        }}
                      />
                    )
                  ) : null}
                  {selectedRace && selection.rosterId ? (
                    <VideoForm
                      key={`new_${selection.raceId}_${selection.rosterId}_${String(formKey)}`}
                      editing={false}
                      initial={videoToFormValues(undefined)}
                      focusOnMount={false}
                      saving={videoSubmit.saving}
                      submitErrorKey={videoSubmit.errorKey}
                      onSubmit={(input) => {
                        void handleSave(input);
                      }}
                      onCancel={() => {
                        videoSubmit.reset();
                        setSelection((prev) => ({ ...prev, rosterId: "" }));
                      }}
                    />
                  ) : null}
                </>
              )}
            </section>
          )}

          <section aria-labelledby="videos-list-heading" className="space-y-3">
            <h2 id="videos-list-heading" className="text-lg font-semibold text-slate-900">
              {t(locale, "raceDay.videos.list.title")}
            </h2>
            {groups.length === 0 ? (
              <p className="text-sm text-slate-600">{t(locale, "raceDay.videos.list.empty")}</p>
            ) : (
              <VideoList
                groups={groups}
                busy={rowAction.saving}
                onEdit={startEdit}
                onDelete={(view) => {
                  void rowAction
                    .submit(() => actions.deleteVideo(activeEvent.eventId, view.video.videoId))
                    .then((outcome) => {
                      if (afterWrite(outcome) && editingId === view.video.videoId) {
                        stopEditing();
                      }
                    });
                }}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
