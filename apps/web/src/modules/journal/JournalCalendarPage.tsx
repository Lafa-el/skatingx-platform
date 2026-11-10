import {
  buildJournalDayWrite,
  getFirestoreDb,
  saveJournalDay,
  setJournalDayCompleted,
  subscribeToJournal,
  type JournalDayInput,
  type JournalDayRecord,
  type JournalSessionRecord,
  type JournalWriteFailure,
} from "@skatingx/firebase-client";
import { todayDateString } from "@skatingx/schema";
import { Button, Card, ErrorNotice, StatusTag } from "@skatingx/ui";
import { useEffect, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tJournal, type JournalMessageKey } from "@/shared/i18n/journal-messages";
import type { Locale } from "@/shared/i18n/translator";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import {
  journalDayForDate,
  journalDayMark,
  journalMonthCells,
  mapJournalDayDetail,
  shiftJournalMonth,
  type JournalDayDetail,
  type JournalMonth,
} from "./journal-calendar";

const WEEKDAYS = [
  "journal.weekday.mon",
  "journal.weekday.tue",
  "journal.weekday.wed",
  "journal.weekday.thu",
  "journal.weekday.fri",
  "journal.weekday.sat",
  "journal.weekday.sun",
] as const satisfies readonly JournalMessageKey[];

const FIELD_KEYS = [
  "date",
  "location",
  "dayType",
  "overallFeeling",
  "energy",
  "soreness",
  "trainingFocus",
  "coachFeedback",
  "parentNote",
] as const satisfies readonly (keyof JournalDayDetail)[];

const FIELD_LABEL: Record<(typeof FIELD_KEYS)[number], JournalMessageKey> = {
  date: "journal.field.date",
  location: "journal.field.location",
  dayType: "journal.field.dayType",
  overallFeeling: "journal.field.overallFeeling",
  energy: "journal.field.energy",
  soreness: "journal.field.soreness",
  trainingFocus: "journal.field.trainingFocus",
  coachFeedback: "journal.field.coachFeedback",
  parentNote: "journal.field.parentNote",
};

const REFLECTION_KEYS = ["bestThing", "needsWork", "tomorrowFocus"] as const;

const REFLECTION_LABEL: Record<(typeof REFLECTION_KEYS)[number], JournalMessageKey> = {
  bestThing: "journal.field.bestThing",
  needsWork: "journal.field.needsWork",
  tomorrowFocus: "journal.field.tomorrowFocus",
};

const MARK_LABEL: Record<"journal" | "session" | "none", JournalMessageKey> = {
  journal: "journal.mark.journal",
  session: "journal.mark.session",
  none: "journal.mark.none",
};

const WRITE_ERROR: Record<JournalWriteFailure, JournalMessageKey> = {
  date: "journal.form.dateInvalid",
  overallFeeling: "journal.form.feelingInvalid",
  energy: "journal.form.energyInvalid",
};

const CONTROL =
  "min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy";

const MONTH_TAG: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

/** Existing document id when this date already has a day, otherwise the date string. */
function journalDocumentId(entry: JournalDayRecord | null, date: string): string {
  return entry?.id ?? date;
}

function monthOf(date: string): JournalMonth {
  const [year, month] = date.split("-").map(Number);
  return { year: year || 1970, month: month || 1 };
}

function monthTitle(month: JournalMonth, locale: Locale): string {
  return new Intl.DateTimeFormat(MONTH_TAG[locale], {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));
}

export function JournalCalendarPage() {
  const locale = useLocale();
  const t = (key: JournalMessageKey, params?: Record<string, string | number>) => tJournal(locale, key, params);
  const { uid } = useAuth();
  const db = getFirestoreDb();
  const [visible, setVisible] = useState<JournalMonth>(() => monthOf(todayDateString()));
  const [picked, setPicked] = useState<string | null>(null);
  const [days, setDays] = useState<readonly JournalDayRecord[]>([]);
  const [sessions, setSessions] = useState<readonly JournalSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [toggleBusy, setToggleBusy] = useState(false);

  useEffect(() => {
    if (!uid || !db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const unsubscribe = subscribeToJournal(
      db,
      uid,
      (snapshot) => {
        setDays(snapshot.days);
        setSessions(snapshot.sessions);
        setLoading(false);
      },
      (error) => {
        logActionFailure("journal", "read", error);
        setFailed(true);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [uid, db, retry]);

  const selected = picked;
  const entry = selected ? journalDayForDate(days, selected) : null;
  const detail = selected ? mapJournalDayDetail(entry, sessions, selected) : null;

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{t("journal.title")}</h1>
      <p className="mt-1 text-brand-navy/80">{t("journal.subtitle")}</p>

      <Card title={monthTitle(visible, locale)} className="mt-4">
        {!uid ? (
          <p>{t("journal.signedOut")}</p>
        ) : !db ? (
          <p>{t("journal.unavailable")}</p>
        ) : failed ? (
          <div>
            <p>{t("journal.error")}</p>
            <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
              {t("journal.retry")}
            </Button>
          </div>
        ) : loading ? (
          <p aria-busy="true">{t("journal.loading")}</p>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setVisible((month) => shiftJournalMonth(month, -1))}>
                {t("journal.month.previous")}
              </Button>
              <Button variant="outline" onClick={() => setVisible((month) => shiftJournalMonth(month, 1))}>
                {t("journal.month.next")}
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-brand-navy/70">
              {WEEKDAYS.map((key) => (
                <div key={key} className="py-1">
                  {t(key)}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {journalMonthCells(visible).map((dateId, index) =>
                dateId ? (
                  <DayCell
                    key={dateId}
                    dateId={dateId}
                    mark={journalDayMark(dateId, days, sessions)}
                    pressed={dateId === selected}
                    label={t("journal.day.button", {
                      date: formatCalendarDate(dateId, locale),
                      mark: t(MARK_LABEL[journalDayMark(dateId, days, sessions)]),
                    })}
                    onPick={setPicked}
                  />
                ) : (
                  <div key={`blank-${String(index)}`} className="min-h-11" />
                ),
              )}
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-brand-navy/80">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-navy" />
                {t("journal.legend.journal")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-navy/40" />
                {t("journal.legend.session")}
              </span>
            </p>
          </div>
        )}
      </Card>

      {selected && detail && uid && db && !loading && !failed ? (
        <Card title={formatCalendarDate(selected, locale)} className="mt-4">
          <DayDetail
            key={selected}
            detail={detail}
            t={t}
            completed={entry?.isCompleted === true}
            toggleBusy={toggleBusy}
            onToggleCompleted={async () => {
              if (!entry) return;
              setToggleBusy(true);
              try {
                await setJournalDayCompleted(
                  db,
                  uid,
                  journalDocumentId(entry, selected),
                  entry.isCompleted !== true,
                  new Date().toISOString(),
                );
              } catch (error) {
                logActionFailure("journal", "complete", error);
                throw error;
              } finally {
                setToggleBusy(false);
              }
            }}
          />
          <JournalDayForm
            key={`${selected}:${entry?.id ?? "new"}`}
            date={selected}
            day={entry}
            onSubmit={async (input) => {
              const built = buildJournalDayWrite(input, {
                now: new Date().toISOString(),
                creating: entry === null,
              });
              if (!built.ok) return built.field;
              await saveJournalDay(db, uid, journalDocumentId(entry, built.data.date), built.data);
              return null;
            }}
          />
        </Card>
      ) : !loading && !failed && uid && db ? (
        <p className="mt-4 text-brand-navy/80">{t("journal.pick")}</p>
      ) : null}
    </section>
  );
}

function DayCell({
  dateId,
  mark,
  pressed,
  label,
  onPick,
}: {
  dateId: string;
  mark: "journal" | "session" | "none";
  pressed: boolean;
  label: string;
  onPick: (dateId: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      className={[
        "flex min-h-11 flex-col items-center justify-center rounded-control text-brand-navy",
        pressed ? "bg-brand-ice" : "",
      ].join(" ")}
      onClick={() => onPick(dateId)}
    >
      <span className="sx-numeric">{Number(dateId.slice(-2))}</span>
      {mark === "none" ? (
        <span className="mt-0.5 h-1.5 w-1.5" />
      ) : (
        <span
          className={[
            "mt-0.5 h-1.5 w-1.5 rounded-full",
            mark === "journal" ? "bg-brand-navy" : "bg-brand-navy/40",
          ].join(" ")}
        />
      )}
    </button>
  );
}

function DayDetail({
  detail,
  t,
  completed,
  onToggleCompleted,
  toggleBusy,
}: {
  detail: JournalDayDetail;
  t: (key: JournalMessageKey) => string;
  completed: boolean;
  onToggleCompleted: () => Promise<void> | void;
  toggleBusy: boolean;
}) {
  const [toggleError, setToggleError] = useState(false);
  const fields = FIELD_KEYS.filter((key) => detail[key] !== undefined);
  const reflection = detail.lindsayReflection;
  const hasDiary = detail.date !== undefined;
  return (
    <div>
      {hasDiary ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {completed ? <StatusTag tone="success">{t("journal.detail.completed")}</StatusTag> : null}
          <Button
            type="button"
            variant="outline"
            disabled={toggleBusy}
            aria-busy={toggleBusy}
            onClick={() => {
              setToggleError(false);
              void Promise.resolve(onToggleCompleted()).catch(() => setToggleError(true));
            }}
          >
            {t(completed ? "journal.detail.markIncomplete" : "journal.detail.markComplete")}
          </Button>
          {toggleError ? <ErrorNotice>{t("journal.detail.completeFailed")}</ErrorNotice> : null}
        </div>
      ) : null}
      {fields.length === 0 ? <p>{t("journal.detail.noDiary")}</p> : null}
      {fields.length > 0 ? (
        <dl className="grid gap-2">
          {fields.map((key) => (
            <div key={key}>
              <dt className="text-sm text-brand-navy/70">{t(FIELD_LABEL[key])}</dt>
              <dd className="text-brand-navy">{detail[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {reflection ? (
        <dl className="mt-3 grid gap-2">
          {REFLECTION_KEYS.filter((key) => reflection[key] !== undefined).map((key) => (
            <div key={key}>
              <dt className="text-sm text-brand-navy/70">{t(REFLECTION_LABEL[key])}</dt>
              <dd className="text-brand-navy">{reflection[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {detail.sessions.length > 0 ? (
        <div className="mt-3">
          <h3 className="text-sm font-semibold text-brand-navy">{t("journal.field.sessions")}</h3>
          <ul className="mt-1 list-disc pl-5 text-brand-navy">
            {detail.sessions.map((session, index) => (
              <li key={`${session.sessionLabel}-${String(index)}`}>{session.sessionLabel}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function JournalDayForm({
  date,
  day,
  onSubmit,
}: {
  date: string;
  day: JournalDayRecord | null;
  onSubmit: (input: JournalDayInput) => Promise<JournalWriteFailure | null>;
}) {
  const locale = useLocale();
  const t = (key: JournalMessageKey) => tJournal(locale, key);
  const [feeling, setFeeling] = useState(day?.overallFeeling !== undefined ? String(day.overallFeeling) : "");
  const [energy, setEnergy] = useState(day?.energy !== undefined ? String(day.energy) : "");
  const [trainingFocus, setTrainingFocus] = useState(day?.trainingFocus ?? "");
  const [soreness, setSoreness] = useState(day?.soreness ?? "");
  const [coachFeedback, setCoachFeedback] = useState(day?.coachFeedback ?? "");
  const [parentNote, setParentNote] = useState(day?.parentNote ?? "");
  const [bestThing, setBestThing] = useState(day?.lindsayReflection?.bestThing ?? "");
  const [needsWork, setNeedsWork] = useState(day?.lindsayReflection?.needsWork ?? "");
  const [tomorrowFocus, setTomorrowFocus] = useState(day?.lindsayReflection?.tomorrowFocus ?? "");
  const [errorKey, setErrorKey] = useState<JournalMessageKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const scores = [1, 2, 3, 4, 5];

  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        setErrorKey(null);
        const input: JournalDayInput = {
          date,
          overallFeeling: Number(feeling),
          trainingFocus,
          soreness,
          coachFeedback,
          parentNote,
          lindsayReflection: { bestThing, needsWork, tomorrowFocus },
        };
        if (energy !== "") input.energy = Number(energy);
        setSaving(true);
        void onSubmit(input)
          .then((failure) => {
            if (failure) setErrorKey(WRITE_ERROR[failure]);
            else setSaved(true);
          })
          .catch((error: unknown) => {
            logActionFailure("journal", "save", error);
            setErrorKey("journal.form.failed");
          })
          .finally(() => setSaving(false));
      }}
    >
      <h3 className="text-sm font-semibold text-brand-navy">
        {t(day ? "journal.form.edit" : "journal.form.create")}
      </h3>
      <label className="grid gap-1 text-sm text-brand-navy" htmlFor="journal-feeling">
        {t("journal.form.feeling")}
        <select
          id="journal-feeling"
          className={CONTROL}
          required
          value={feeling}
          onChange={(event) => setFeeling(event.target.value)}
        >
          <option value="">{t("journal.form.choose")}</option>
          {scores.map((score) => (
            <option key={score} value={score}>
              {score}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm text-brand-navy" htmlFor="journal-energy">
        {t("journal.form.energy")}
        <select
          id="journal-energy"
          className={CONTROL}
          value={energy}
          onChange={(event) => setEnergy(event.target.value)}
        >
          <option value="">{t("journal.form.blank")}</option>
          {scores.map((score) => (
            <option key={score} value={score}>
              {score}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm text-brand-navy" htmlFor="journal-soreness">
        {t("journal.field.soreness")}
        <textarea
          id="journal-soreness"
          className={CONTROL}
          value={soreness}
          onChange={(event) => setSoreness(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm text-brand-navy" htmlFor="journal-focus">
        {t("journal.field.trainingFocus")}
        <input
          id="journal-focus"
          className={CONTROL}
          value={trainingFocus}
          onChange={(event) => setTrainingFocus(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm text-brand-navy" htmlFor="journal-coach">
        {t("journal.field.coachFeedback")}
        <textarea
          id="journal-coach"
          className={CONTROL}
          value={coachFeedback}
          onChange={(event) => setCoachFeedback(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm text-brand-navy" htmlFor="journal-parent">
        {t("journal.field.parentNote")}
        <textarea
          id="journal-parent"
          className={CONTROL}
          value={parentNote}
          onChange={(event) => setParentNote(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm text-brand-navy" htmlFor="journal-best">
        {t("journal.field.bestThing")}
        <input
          id="journal-best"
          className={CONTROL}
          value={bestThing}
          onChange={(event) => setBestThing(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm text-brand-navy" htmlFor="journal-work">
        {t("journal.field.needsWork")}
        <input
          id="journal-work"
          className={CONTROL}
          value={needsWork}
          onChange={(event) => setNeedsWork(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm text-brand-navy" htmlFor="journal-tomorrow">
        {t("journal.field.tomorrowFocus")}
        <input
          id="journal-tomorrow"
          className={CONTROL}
          value={tomorrowFocus}
          onChange={(event) => setTomorrowFocus(event.target.value)}
        />
      </label>
      {errorKey ? <ErrorNotice>{t(errorKey)}</ErrorNotice> : null}
      {saved ? <p>{t("journal.form.saved")}</p> : null}
      <Button type="submit" disabled={saving}>
        {t(saving ? "journal.form.saving" : "journal.form.save")}
      </Button>
    </form>
  );
}
