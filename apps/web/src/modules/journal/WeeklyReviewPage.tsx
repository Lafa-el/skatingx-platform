import {
  COACH_NOTE_TAGS,
  SESSION_FOCUS_TAGS,
  getFirestoreDb,
  saveWeeklyReview,
  subscribeToCoachNotes,
  subscribeToJournal,
  subscribeToWeeklyReview,
  type CoachNoteSnapshot,
  type JournalSnapshot,
  type WeeklyReviewInput,
  type WeeklyReviewRecord,
} from "@skatingx/firebase-client";
import { DEFAULT_TRAINING_DISTANCES, todayDateString } from "@skatingx/schema";
import { addDaysToDateString, deriveWeeklyReviewStats, formatResultTime, mondayOfWeek } from "@skatingx/skating-domain";
import { Button, ErrorNotice } from "@skatingx/ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useTrainingRecords } from "@/hooks/useTrainingRecords";
import { useLocale } from "@/hooks/useLocale";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tJournal, type JournalMessageKey } from "@/shared/i18n/journal-messages";
import type { TranslationParams } from "@/shared/i18n/translator";
import { logActionFailure } from "@/shared/utils/logActionFailure";

const CONTROL =
  "min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy";

const PRESET_ORDER = [
  ...SESSION_FOCUS_TAGS,
  ...COACH_NOTE_TAGS.filter((tag) => !(SESSION_FOCUS_TAGS as readonly string[]).includes(tag)),
];

const FOCUS_LABEL: Record<string, JournalMessageKey> = {
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
  high_center_of_gravity: "journal.coachNotes.tag.highCenterOfGravity",
  right_leg_support: "journal.coachNotes.tag.rightLegSupport",
  exit_angle: "journal.coachNotes.tag.exitAngle",
  straightaway_bouncing: "journal.coachNotes.tag.straightawayBouncing",
  incomplete_push: "journal.coachNotes.tag.incompletePush",
  start_technique: "journal.coachNotes.tag.startTechnique",
  block_start: "journal.coachNotes.tag.blockStart",
  jump_takeoff: "journal.coachNotes.tag.jumpTakeoff",
  rotation: "journal.coachNotes.tag.rotation",
  spin_centering: "journal.coachNotes.tag.spinCentering",
  program_flow: "journal.coachNotes.tag.programFlow",
  transitions: "journal.coachNotes.tag.transitions",
};

function monthDay(date: string): string {
  return date.slice(5);
}

export function WeeklyReviewPage() {
  const locale = useLocale();
  const t = (key: JournalMessageKey, params?: TranslationParams) => tJournal(locale, key, params);
  const { uid } = useAuth();
  const db = getFirestoreDb();
  const records = useTrainingRecords();
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(todayDateString()));
  const [journal, setJournal] = useState<JournalSnapshot | null>(null);
  const [notes, setNotes] = useState<CoachNoteSnapshot | null>(null);
  const [review, setReview] = useState<WeeklyReviewRecord | null>(null);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const thisWeek = mondayOfWeek(todayDateString());
  const weekEnd = addDaysToDateString(weekStart, 6);

  useEffect(() => {
    if (!uid || !db) return;
    setFailed(false);
    setJournal(null);
    setNotes(null);
    const fail = (error: unknown) => {
      logActionFailure("weekly-review", "read", error);
      setFailed(true);
    };
    const unsubJournal = subscribeToJournal(db, uid, setJournal, fail);
    const unsubNotes = subscribeToCoachNotes(db, uid, setNotes, fail);
    return () => {
      unsubJournal();
      unsubNotes();
    };
  }, [uid, db, retry]);

  useEffect(() => {
    if (!uid || !db) return;
    setLoadedWeek(null);
    return subscribeToWeeklyReview(
      db,
      uid,
      weekStart,
      (next) => {
        setReview(next);
        setLoadedWeek(weekStart);
      },
      (error) => {
        logActionFailure("weekly-review", "read", error);
        setFailed(true);
      },
    );
  }, [uid, db, weekStart, retry]);

  const stats = useMemo(() => {
    const distances = DEFAULT_TRAINING_DISTANCES.flatMap((distance) => {
      const document = records.recordsByDistance[distance.distanceId];
      if (!document) return [];
      return [{ distanceId: document.distanceId, label: document.label, entries: document.entries }];
    });
    return deriveWeeklyReviewStats({
      weekStart,
      days: journal?.days ?? [],
      sessions: journal?.sessions ?? [],
      notes: notes?.notes ?? [],
      distances,
      presetOrder: PRESET_ORDER,
    });
  }, [journal, notes, records.recordsByDistance, weekStart]);

  const ready = journal !== null && notes !== null && loadedWeek === weekStart && !records.loading;
  const loading = Boolean(uid && db && !failed && !ready);
  const hasWeekData =
    stats.trainingDays > 0 ||
    stats.totalSessions > 0 ||
    stats.focusTop.length > 0 ||
    stats.notesTop.length > 0 ||
    stats.bestTimes.length > 0;

  function focusName(label: string): string {
    const key = FOCUS_LABEL[label];
    return key ? t(key) : label;
  }

  async function save(input: WeeklyReviewInput) {
    if (!db || !uid) return { ok: false as const, field: "weekStart" as const };
    return saveWeeklyReview(db, uid, weekStart, input, new Date().toISOString());
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{t("journal.weeklyReview.title")}</h1>
      <p className="mt-1 text-brand-navy/80">{t("journal.weeklyReview.subtitle")}</p>

      {!uid ? (
        <p className="mt-4">{t("journal.weeklyReview.signedOut")}</p>
      ) : !db ? (
        <p className="mt-4">{t("journal.weeklyReview.unavailable")}</p>
      ) : failed ? (
        <div className="mt-4">
          <p>{t("journal.weeklyReview.error")}</p>
          <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
            {t("journal.weeklyReview.retry")}
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <div role="group" aria-label={t("journal.weeklyReview.week")} className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setWeekStart(addDaysToDateString(weekStart, -7))}>
              {t("journal.weeklyReview.previous")}
            </Button>
            <Button variant={weekStart === thisWeek ? "brand" : "outline"} onClick={() => setWeekStart(thisWeek)}>
              {t("journal.weeklyReview.current")}
            </Button>
            <Button variant="outline" onClick={() => setWeekStart(addDaysToDateString(weekStart, 7))}>
              {t("journal.weeklyReview.next")}
            </Button>
          </div>
          <p className="mt-3 text-brand-navy">
            {t("journal.weeklyReview.range", { start: monthDay(weekStart), end: monthDay(weekEnd) })}
          </p>

          {loading ? (
            <p className="mt-4" aria-busy="true">
              {t("journal.weeklyReview.loading")}
            </p>
          ) : (
            <>
              {hasWeekData ? (
                <div className="mt-4 space-y-4">
                  <dl className="grid gap-2 text-brand-navy sm:grid-cols-2">
                    <Stat label={t("journal.weeklyReview.stat.days")} value={String(stats.trainingDays)} />
                    <Stat label={t("journal.weeklyReview.stat.ice")} value={String(stats.iceCount)} />
                    <Stat label={t("journal.weeklyReview.stat.dryland")} value={String(stats.drylandCount)} />
                    <Stat label={t("journal.weeklyReview.stat.privateLesson")} value={String(stats.privateLessonCount)} />
                    <Stat
                      label={t("journal.weeklyReview.stat.minutes")}
                      value={t("journal.weeklyReview.minutes", { count: stats.totalMinutes })}
                    />
                    <Stat label={t("journal.weeklyReview.stat.sessions")} value={String(stats.totalSessions)} />
                  </dl>

                  {stats.focusTop.length > 0 ? (
                    <section aria-label={t("journal.weeklyReview.stat.focus")}>
                      <h2 className="text-lg font-semibold text-brand-navy">{t("journal.weeklyReview.stat.focus")}</h2>
                      <ul className="mt-2 flex flex-wrap gap-1">
                        {stats.focusTop.map((item) => (
                          <li
                            key={item.label}
                            className="rounded-full border border-brand-navy/15 px-2 py-1 text-xs font-medium text-brand-navy"
                          >
                            {focusName(item.label)}
                            {": "}
                            {item.count}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {stats.notesTop.length > 0 ? (
                    <section aria-label={t("journal.weeklyReview.stat.notes")}>
                      <h2 className="text-lg font-semibold text-brand-navy">{t("journal.weeklyReview.stat.notes")}</h2>
                      <ul className="mt-2 space-y-2">
                        {stats.notesTop.map((note, index) => (
                          <li key={`${note.date}-${index}`} className="text-brand-navy">
                            <p>{formatCalendarDate(note.date, locale)}</p>
                            {note.coachName ? <p>{note.coachName}</p> : null}
                            {note.note ? <p className="whitespace-pre-wrap">{note.note}</p> : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {stats.bestTimes.length > 0 ? (
                    <section aria-label={t("journal.weeklyReview.stat.best")}>
                      <h2 className="text-lg font-semibold text-brand-navy">{t("journal.weeklyReview.stat.best")}</h2>
                      <ul className="mt-2 space-y-1 text-brand-navy">
                        {stats.bestTimes.map((row) => (
                          <li key={row.distanceId}>
                            {row.label}
                            {": "}
                            {formatResultTime(row.timeSeconds)}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {records.error ? <ErrorNotice>{records.error}</ErrorNotice> : null}
                </div>
              ) : (
                <p className="mt-4">{t("journal.weeklyReview.empty")}</p>
              )}

              {loadedWeek === weekStart ? (
                <ReviewForm key={weekStart} review={review} onSave={save} />
              ) : null}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReviewForm({
  review,
  onSave,
}: {
  review: WeeklyReviewRecord | null;
  onSave: (input: WeeklyReviewInput) => Promise<{ ok: true } | { ok: false; field: "weekStart" }>;
}) {
  const locale = useLocale();
  const t = (key: JournalMessageKey) => tJournal(locale, key);
  const [bestMoment, setBestMoment] = useState(review?.bestMoment ?? "");
  const [nextWeekFocus, setNextWeekFocus] = useState(review?.nextWeekFocus ?? "");
  const [parentSummary, setParentSummary] = useState(review?.parentSummary ?? "");
  const [busy, setBusy] = useState(false);
  const [weekError, setWeekError] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setWeekError(false);
    setFailed(false);
    try {
      const result = await onSave({ bestMoment, nextWeekFocus, parentSummary });
      if (!result.ok) setWeekError(true);
    } catch (error) {
      logActionFailure("weekly-review", "save", error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-labelledby="weekly-review-form-title" className="mt-6 space-y-3" onSubmit={(event) => void submit(event)}>
      <h2 id="weekly-review-form-title" className="text-lg font-semibold text-brand-navy">
        {t("journal.weeklyReview.form.title")}
      </h2>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="review-best">
        {t("journal.weeklyReview.field.bestMoment")}
        <textarea
          id="review-best"
          className={`${CONTROL} mt-1 min-h-24 py-2`}
          value={bestMoment}
          onChange={(event) => setBestMoment(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="review-focus">
        {t("journal.weeklyReview.field.nextWeekFocus")}
        <textarea
          id="review-focus"
          className={`${CONTROL} mt-1 min-h-24 py-2`}
          value={nextWeekFocus}
          onChange={(event) => setNextWeekFocus(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="review-parent">
        {t("journal.weeklyReview.field.parentSummary")}
        <textarea
          id="review-parent"
          className={`${CONTROL} mt-1 min-h-24 py-2`}
          value={parentSummary}
          onChange={(event) => setParentSummary(event.target.value)}
        />
      </label>
      {weekError ? <ErrorNotice>{t("journal.weeklyReview.form.weekInvalid")}</ErrorNotice> : null}
      {failed ? <ErrorNotice>{t("journal.weeklyReview.form.failed")}</ErrorNotice> : null}
      <Button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? t("journal.weeklyReview.form.saving") : t("journal.weeklyReview.form.save")}
      </Button>
    </form>
  );
}
