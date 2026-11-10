import {
  SESSION_FOCUS_TAGS,
  SESSION_TYPES,
  createJournalSession,
  deleteJournalSession,
  getFirestoreDb,
  subscribeToJournal,
  updateJournalSession,
  type JournalSessionFocusTag,
  type JournalSessionInput,
  type JournalSessionRecord,
  type JournalSessionType,
  type JournalSessionWriteFailure,
} from "@skatingx/firebase-client";
import { todayDateString } from "@skatingx/schema";
import { Button, Card, ErrorNotice } from "@skatingx/ui";
import { useEffect, useState, type FormEvent } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tJournal, type JournalMessageKey } from "@/shared/i18n/journal-messages";
import type { TranslationParams } from "@/shared/i18n/translator";
import { logActionFailure } from "@/shared/utils/logActionFailure";

const CONTROL =
  "min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy";

const INTENSITY_LEVELS = [1, 2, 3, 4, 5] as const;

const TYPE_LABEL: Record<JournalSessionType, JournalMessageKey> = {
  ice: "journal.sessions.type.ice",
  dryland: "journal.sessions.type.dryland",
  private_lesson: "journal.sessions.type.privateLesson",
  competition: "journal.sessions.type.competition",
  recovery: "journal.sessions.type.recovery",
  rest: "journal.sessions.type.rest",
};

const TAG_LABEL: Record<JournalSessionFocusTag, JournalMessageKey> = {
  start: "journal.sessions.tag.start",
  "500m": "journal.sessions.tag.500m",
  "1000m": "journal.sessions.tag.1000m",
  "1500m": "journal.sessions.tag.1500m",
  corner_entry: "journal.sessions.tag.cornerEntry",
  corner_drift: "journal.sessions.tag.cornerDrift",
  follow_skating: "journal.sessions.tag.followSkating",
  footwork: "journal.sessions.tag.footwork",
  edges: "journal.sessions.tag.edges",
  jumps: "journal.sessions.tag.jumps",
  spins: "journal.sessions.tag.spins",
  program: "journal.sessions.tag.program",
  speed_work: "journal.sessions.tag.speedWork",
  endurance: "journal.sessions.tag.endurance",
};

const FLAGS = [
  { key: "startsPractice", labelKey: "journal.sessions.flag.starts" },
  { key: "cornerFocus", labelKey: "journal.sessions.flag.corner" },
  { key: "straightawayFocus", labelKey: "journal.sessions.flag.straightaway" },
  { key: "relayPractice", labelKey: "journal.sessions.flag.relay" },
  { key: "raceSimulation", labelKey: "journal.sessions.flag.race" },
] as const satisfies readonly { key: keyof JournalSessionRecord; labelKey: JournalMessageKey }[];

type Editor = { mode: "create" } | { mode: "edit"; id: string };

function byDateDesc(a: JournalSessionRecord, b: JournalSessionRecord): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function isTag(value: string): value is JournalSessionFocusTag {
  return (SESSION_FOCUS_TAGS as readonly string[]).includes(value);
}

function groupByDate(sessions: readonly JournalSessionRecord[]) {
  const groups: { date: string; items: JournalSessionRecord[] }[] = [];
  for (const session of [...sessions].sort(byDateDesc)) {
    const last = groups.at(-1);
    if (!last || last.date !== session.date) groups.push({ date: session.date, items: [session] });
    else last.items.push(session);
  }
  return groups;
}

export function SessionsPage() {
  const locale = useLocale();
  const t = (key: JournalMessageKey, params?: TranslationParams) => tJournal(locale, key, params);
  const { uid } = useAuth();
  const db = getFirestoreDb();
  const [sessions, setSessions] = useState<readonly JournalSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    if (!uid || !db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    return subscribeToJournal(
      db,
      uid,
      (snapshot) => {
        setSessions(snapshot.sessions);
        setLoading(false);
      },
      (error) => {
        logActionFailure("sessions", "read", error);
        setFailed(true);
        setLoading(false);
      },
    );
  }, [uid, db, retry]);

  const groups = groupByDate(sessions);
  const editing = editor?.mode === "edit" ? sessions.find((session) => session.id === editor.id) : undefined;

  function titleOf(session: JournalSessionRecord): string {
    if (session.sessionLabel) return session.sessionLabel;
    if (session.sessionType) return t(TYPE_LABEL[session.sessionType]);
    return t("journal.sessions.untitled");
  }

  async function save(input: JournalSessionInput): Promise<{ ok: true } | { ok: false; field: JournalSessionWriteFailure }> {
    if (!db || !uid || !editor) return { ok: false, field: "date" };
    const now = new Date().toISOString();
    const result =
      editor.mode === "edit"
        ? await updateJournalSession(db, uid, editor.id, input, now)
        : await createJournalSession(db, uid, input, now);
    if (result.ok) setEditor(null);
    return result.ok ? { ok: true } : result;
  }

  async function confirmDelete() {
    if (!db || !uid || !pendingDelete) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteJournalSession(db, uid, pendingDelete);
      if (editor?.mode === "edit" && editor.id === pendingDelete) setEditor(null);
      setPendingDelete(null);
    } catch (error) {
      logActionFailure("sessions", "delete", error);
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{t("journal.sessions.title")}</h1>
      <p className="mt-1 text-brand-navy/80">{t("journal.sessions.subtitle")}</p>

      {!uid ? (
        <p className="mt-4">{t("journal.sessions.signedOut")}</p>
      ) : !db ? (
        <p className="mt-4">{t("journal.sessions.unavailable")}</p>
      ) : failed ? (
        <div className="mt-4">
          <p>{t("journal.sessions.error")}</p>
          <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
            {t("journal.sessions.retry")}
          </Button>
        </div>
      ) : loading ? (
        <p className="mt-4" aria-busy="true">
          {t("journal.sessions.loading")}
        </p>
      ) : (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setEditor({ mode: "create" })}>
            {t("journal.sessions.action.add")}
          </Button>

          {editor ? (
            <SessionForm
              key={editor.mode === "edit" ? editor.id : "create"}
              mode={editor.mode}
              session={editing}
              onCancel={() => setEditor(null)}
              onSubmit={save}
            />
          ) : null}

          {sessions.length === 0 ? (
            <p className="mt-4">{t("journal.sessions.empty")}</p>
          ) : (
            <div className="mt-4 space-y-6">
              {groups.map((group) => (
                <section key={group.date} aria-label={formatCalendarDate(group.date, locale)}>
                  <h2 className="text-lg font-semibold text-brand-navy">{formatCalendarDate(group.date, locale)}</h2>
                  <ul className="mt-3 space-y-3">
                    {group.items.map((session) => {
                      const flags = FLAGS.filter((flag) => session[flag.key] === true);
                      return (
                        <li key={session.id}>
                          <Card title={titleOf(session)}>
                            {session.coachName ? <p>{session.coachName}</p> : null}
                            {session.location ? <p className="mt-2">{session.location}</p> : null}
                            {session.sessionType ? <p className="mt-2">{t(TYPE_LABEL[session.sessionType])}</p> : null}
                            {session.intensity !== undefined ? (
                              <p className="mt-2">
                                <span className="font-medium">{t("journal.sessions.field.intensity")}</span>
                                {": "}
                                {t("journal.sessions.intensityValue", { level: session.intensity })}
                              </p>
                            ) : null}
                            {session.durationMinutes !== undefined ? (
                              <p className="mt-2">
                                <span className="font-medium">{t("journal.sessions.field.duration")}</span>
                                {": "}
                                {t("journal.sessions.minutes", { count: session.durationMinutes })}
                              </p>
                            ) : null}
                            {session.iceTimeMinutes !== undefined ? (
                              <p className="mt-2">
                                <span className="font-medium">{t("journal.sessions.field.ice")}</span>
                                {": "}
                                {t("journal.sessions.minutes", { count: session.iceTimeMinutes })}
                              </p>
                            ) : null}
                            {session.drylandMinutes !== undefined ? (
                              <p className="mt-2">
                                <span className="font-medium">{t("journal.sessions.field.dryland")}</span>
                                {": "}
                                {t("journal.sessions.minutes", { count: session.drylandMinutes })}
                              </p>
                            ) : null}
                            {session.focusTags && session.focusTags.length > 0 ? (
                              <ul className="mt-2 flex flex-wrap gap-1" aria-label={t("journal.sessions.field.tags")}>
                                {session.focusTags.filter(isTag).map((tag) => (
                                  <li
                                    key={tag}
                                    className="rounded-full border border-brand-navy/15 px-2 py-1 text-xs font-medium text-brand-navy"
                                  >
                                    {t(TAG_LABEL[tag])}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {session.technicalFocus ? <p className="mt-2 whitespace-pre-wrap">{session.technicalFocus}</p> : null}
                            {session.mainSet ? <p className="mt-2 whitespace-pre-wrap">{session.mainSet}</p> : null}
                            {session.notes ? <p className="mt-2 whitespace-pre-wrap">{session.notes}</p> : null}
                            {flags.length > 0 ? (
                              <ul className="mt-2 flex flex-wrap gap-1" aria-label={t("journal.sessions.field.flags")}>
                                {flags.map((flag) => (
                                  <li
                                    key={flag.key}
                                    className="rounded-full border border-brand-navy/15 px-2 py-1 text-xs font-medium text-brand-navy"
                                  >
                                    {t(flag.labelKey)}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {session.lapTimesNote ? (
                              <p className="mt-2">
                                <span className="font-medium">{t("journal.sessions.field.lapTimes")}</span>
                                {": "}
                                {session.lapTimesNote}
                              </p>
                            ) : null}
                            {session.equipmentNote ? (
                              <p className="mt-2">
                                <span className="font-medium">{t("journal.sessions.field.equipment")}</span>
                                {": "}
                                {session.equipmentNote}
                              </p>
                            ) : null}
                            {session.recoveryNote ? (
                              <p className="mt-2">
                                <span className="font-medium">{t("journal.sessions.field.recovery")}</span>
                                {": "}
                                {session.recoveryNote}
                              </p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button variant="outline" onClick={() => setEditor({ mode: "edit", id: session.id })}>
                                {t("journal.sessions.action.edit")}
                              </Button>
                              <Button
                                variant="danger-outline"
                                onClick={() => {
                                  setDeleteFailed(false);
                                  setPendingDelete(session.id);
                                }}
                              >
                                {t("journal.sessions.action.delete")}
                              </Button>
                            </div>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {pendingDelete ? (
            <div
              role="alertdialog"
              aria-labelledby="session-delete-title"
              className="mt-6 rounded-card border border-status-danger/40 p-4"
            >
              <h2 id="session-delete-title" className="text-lg font-semibold text-status-danger">
                {t("journal.sessions.delete.title")}
              </h2>
              <p className="mt-2 text-sm text-brand-navy">{t("journal.sessions.delete.body")}</p>
              {deleteFailed ? <ErrorNotice className="mt-3">{t("journal.sessions.delete.failed")}</ErrorNotice> : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="danger-outline" disabled={deleting} onClick={() => void confirmDelete()}>
                  {deleting ? t("journal.sessions.delete.busy") : t("journal.sessions.delete.confirm")}
                </Button>
                <Button
                  variant="outline"
                  disabled={deleting}
                  onClick={() => {
                    setPendingDelete(null);
                    setDeleteFailed(false);
                  }}
                >
                  {t("journal.sessions.delete.cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function SessionForm({
  mode,
  session,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  session?: JournalSessionRecord;
  onCancel: () => void;
  onSubmit: (input: JournalSessionInput) => Promise<{ ok: true } | { ok: false; field: JournalSessionWriteFailure }>;
}) {
  const locale = useLocale();
  const t = (key: JournalMessageKey) => tJournal(locale, key);
  const [date, setDate] = useState(session?.date ?? todayDateString());
  const [sessionType, setSessionType] = useState<JournalSessionType>(session?.sessionType ?? "ice");
  const [sessionLabel, setSessionLabel] = useState(session?.sessionLabel ?? "");
  const [location, setLocation] = useState(session?.location ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    session?.durationMinutes === undefined ? "" : String(session.durationMinutes),
  );
  const [iceTimeMinutes, setIceTimeMinutes] = useState(
    session?.iceTimeMinutes === undefined ? "" : String(session.iceTimeMinutes),
  );
  const [drylandMinutes, setDrylandMinutes] = useState(
    session?.drylandMinutes === undefined ? "" : String(session.drylandMinutes),
  );
  const [intensity, setIntensity] = useState(session?.intensity ?? 3);
  const [technicalFocus, setTechnicalFocus] = useState(session?.technicalFocus ?? "");
  const [mainSet, setMainSet] = useState(session?.mainSet ?? "");
  const [flags, setFlags] = useState<Record<(typeof FLAGS)[number]["key"], boolean>>({
    startsPractice: session?.startsPractice === true,
    cornerFocus: session?.cornerFocus === true,
    straightawayFocus: session?.straightawayFocus === true,
    relayPractice: session?.relayPractice === true,
    raceSimulation: session?.raceSimulation === true,
  });
  const [lapTimesNote, setLapTimesNote] = useState(session?.lapTimesNote ?? "");
  const [equipmentNote, setEquipmentNote] = useState(session?.equipmentNote ?? "");
  const [recoveryNote, setRecoveryNote] = useState(session?.recoveryNote ?? "");
  const [tags, setTags] = useState<readonly string[]>(session?.focusTags ?? []);
  const [coachName, setCoachName] = useState(session?.coachName ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = t(mode === "create" ? "journal.sessions.form.create" : "journal.sessions.form.edit");

  function toggleTag(tag: JournalSessionFocusTag) {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setDateError(false);
    setFailed(false);
    try {
      const result = await onSubmit({
        date,
        sessionType,
        sessionLabel,
        location,
        durationMinutes,
        iceTimeMinutes,
        drylandMinutes,
        intensity,
        technicalFocus,
        mainSet,
        startsPractice: flags.startsPractice,
        cornerFocus: flags.cornerFocus,
        straightawayFocus: flags.straightawayFocus,
        relayPractice: flags.relayPractice,
        raceSimulation: flags.raceSimulation,
        lapTimesNote,
        equipmentNote,
        recoveryNote,
        focusTags: SESSION_FOCUS_TAGS.filter((tag) => tags.includes(tag)),
        coachName,
        notes,
      });
      if (!result.ok) {
        setDateError(true);
        setBusy(false);
      }
    } catch (error) {
      logActionFailure("sessions", "save", error);
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <form aria-labelledby="session-form-title" className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}>
      <h2 id="session-form-title" className="text-lg font-semibold text-brand-navy">
        {title}
      </h2>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-date">
        {t("journal.sessions.field.date")}
        <input
          id="session-date"
          className={`${CONTROL} mt-1`}
          value={date}
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <div role="group" aria-label={t("journal.sessions.field.type")} className="flex flex-wrap gap-2">
        {SESSION_TYPES.map((value) => (
          <Button
            key={value}
            variant={sessionType === value ? "brand" : "outline"}
            aria-pressed={sessionType === value}
            onClick={() => setSessionType(value)}
          >
            {t(TYPE_LABEL[value])}
          </Button>
        ))}
      </div>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-label">
        {t("journal.sessions.field.label")}
        <input
          id="session-label"
          className={`${CONTROL} mt-1`}
          value={sessionLabel}
          onChange={(event) => setSessionLabel(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-location">
        {t("journal.sessions.field.location")}
        <input
          id="session-location"
          className={`${CONTROL} mt-1`}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-duration">
        {t("journal.sessions.field.duration")}
        <input
          id="session-duration"
          className={`${CONTROL} mt-1`}
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-ice">
        {t("journal.sessions.field.ice")}
        <input
          id="session-ice"
          className={`${CONTROL} mt-1`}
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={iceTimeMinutes}
          onChange={(event) => setIceTimeMinutes(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-dryland">
        {t("journal.sessions.field.dryland")}
        <input
          id="session-dryland"
          className={`${CONTROL} mt-1`}
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={drylandMinutes}
          onChange={(event) => setDrylandMinutes(event.target.value)}
        />
      </label>
      <div role="group" aria-label={t("journal.sessions.field.intensity")} className="flex flex-wrap gap-2">
        {INTENSITY_LEVELS.map((level) => (
          <Button
            key={level}
            variant={intensity === level ? "brand" : "outline"}
            aria-pressed={intensity === level}
            onClick={() => setIntensity(level)}
          >
            {level}
          </Button>
        ))}
      </div>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-technical">
        {t("journal.sessions.field.technicalFocus")}
        <textarea
          id="session-technical"
          className={`${CONTROL} mt-1 min-h-20 py-2`}
          value={technicalFocus}
          onChange={(event) => setTechnicalFocus(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-main">
        {t("journal.sessions.field.mainSet")}
        <textarea
          id="session-main"
          className={`${CONTROL} mt-1 min-h-20 py-2`}
          value={mainSet}
          onChange={(event) => setMainSet(event.target.value)}
        />
      </label>
      <fieldset>
        <legend className="text-sm font-medium text-brand-navy">{t("journal.sessions.field.flags")}</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {FLAGS.map((flag) => (
            <label key={flag.key} className="inline-flex min-h-11 items-center gap-2 text-sm text-brand-navy">
              <input
                type="checkbox"
                checked={flags[flag.key]}
                onChange={() => setFlags((current) => ({ ...current, [flag.key]: !current[flag.key] }))}
              />
              {t(flag.labelKey)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-laps">
        {t("journal.sessions.field.lapTimes")}
        <textarea
          id="session-laps"
          className={`${CONTROL} mt-1 min-h-20 py-2`}
          value={lapTimesNote}
          onChange={(event) => setLapTimesNote(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-equipment">
        {t("journal.sessions.field.equipment")}
        <textarea
          id="session-equipment"
          className={`${CONTROL} mt-1 min-h-20 py-2`}
          value={equipmentNote}
          onChange={(event) => setEquipmentNote(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-recovery">
        {t("journal.sessions.field.recovery")}
        <textarea
          id="session-recovery"
          className={`${CONTROL} mt-1 min-h-20 py-2`}
          value={recoveryNote}
          onChange={(event) => setRecoveryNote(event.target.value)}
        />
      </label>
      <fieldset>
        <legend className="text-sm font-medium text-brand-navy">{t("journal.sessions.field.tags")}</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {SESSION_FOCUS_TAGS.map((tag) => (
            <label key={tag} className="inline-flex min-h-11 items-center gap-2 text-sm text-brand-navy">
              <input type="checkbox" checked={tags.includes(tag)} onChange={() => toggleTag(tag)} />
              {t(TAG_LABEL[tag])}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-coach">
        {t("journal.sessions.field.coach")}
        <input
          id="session-coach"
          className={`${CONTROL} mt-1`}
          value={coachName}
          onChange={(event) => setCoachName(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="session-notes">
        {t("journal.sessions.field.notes")}
        <textarea
          id="session-notes"
          className={`${CONTROL} mt-1 min-h-24 py-2`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {dateError ? <ErrorNotice>{t("journal.sessions.form.dateInvalid")}</ErrorNotice> : null}
      {failed ? <ErrorNotice>{t("journal.sessions.form.failed")}</ErrorNotice> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("journal.sessions.form.saving") : t("journal.sessions.form.save")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          {t("journal.sessions.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
