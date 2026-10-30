import { DEFAULT_ATHLETE_ID, todayDateString } from "@skatingx/schema";
import {
  deriveRaceWeekFeedback,
  deriveTrainingFeedback,
  mondayOfWeek,
  normalizeTrainingState,
  PLAN_FOCUSES,
  PLAN_WEEK_NUMBER,
  planDayDate,
  planDayProgress,
  planDays,
  type PlanDayProgress,
  previousDateString,
  trainingFeedbackKey,
  type FeedbackSource,
  type PlanFocus,
  type RaceWeekFeedback,
  type TrainingFeedback,
} from "@skatingx/skating-domain";
import {
  getFirestoreDb,
  subscribeToEquipmentHistory,
  subscribeToSavedAnalyses,
  subscribeToTaskHistoryMonth,
  type ArchivedTask,
} from "@skatingx/firebase-client";
import { Button, Card, StatusTag } from "@skatingx/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { useTrainingState, useUserSettings } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { useRaceWeekEvents } from "@/hooks/useRaceWeekEvents";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tPlan, type PlanMessageKey } from "@/shared/i18n/plan-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import { dayCopy } from "./plan-day-copy";
import { dayEntries } from "./plan-day-entries";
import { readHiddenFeedback, usePlanFocus, writeHiddenFeedback } from "./plan-session";

const FOCUS_TITLE: Record<PlanFocus, PlanMessageKey> = {
  lean: "plan.focus.lean.title",
  bounce: "plan.focus.bounce.title",
  endurance: "plan.focus.endurance.title",
};

const FOCUS_DETAIL: Record<PlanFocus, PlanMessageKey> = {
  lean: "plan.focus.lean.detail",
  bounce: "plan.focus.bounce.detail",
  endurance: "plan.focus.endurance.detail",
};

const FOCUS_SUMMARY: Record<PlanFocus, PlanMessageKey> = {
  lean: "plan.focus.lean.summary",
  bounce: "plan.focus.bounce.summary",
  endurance: "plan.focus.endurance.summary",
};

function analysisDay(createdAt: string, locale: ReturnType<typeof useLocale>): string {
  const day = createdAt.slice(0, 10);
  const formatted = formatCalendarDate(day, locale);
  return formatted === day && createdAt.length > 10 ? createdAt : formatted;
}

function raceDates(item: RaceWeekFeedback, locale: ReturnType<typeof useLocale>): string {
  if (item.firstDay === item.lastDay) return formatCalendarDate(item.firstDay, locale);
  return tPlan(locale, "plan.feedback.race.range", {
    from: formatCalendarDate(item.firstDay, locale),
    to: formatCalendarDate(item.lastDay, locale),
  });
}

type HistoryRead = {
  /** Which user, week and day the read is for, so a read of an earlier day is not shown as today's. */
  key: string;
  status: "loading" | "ready" | "error";
  days: ReadonlyMap<string, readonly ArchivedTask[]>;
};

/** The words under a day card. Nothing for a later day: only the schedule is shown. */
function progressLine(
  locale: ReturnType<typeof useLocale>,
  progress: PlanDayProgress,
  read: { isToday: boolean; isPast: boolean; stateLoading: boolean; stateFailed: boolean; pastStatus: HistoryRead["status"] },
): string | null {
  if (progress.kind === "future") return null;
  if (progress.kind === "rest") return tPlan(locale, "plan.progress.rest");
  // A read that has not arrived or has failed is said so, and never shown as an empty day.
  if (read.isToday && read.stateLoading) return tPlan(locale, "plan.progress.loading");
  if (read.isToday && read.stateFailed) return tPlan(locale, "plan.progress.unreadable");
  if (read.isPast && read.pastStatus === "loading") return tPlan(locale, "plan.progress.loading");
  if (read.isPast && read.pastStatus === "error") return tPlan(locale, "plan.progress.unreadable");
  switch (progress.kind) {
    case "not-generated":
      return tPlan(locale, "plan.progress.notGenerated");
    case "cleared":
      return tPlan(locale, "plan.progress.cleared");
    case "no-record":
      return tPlan(locale, "plan.progress.noRecord");
    case "no-plan-tasks":
      return tPlan(locale, "plan.progress.noPlanTasks");
    case "progress":
      return tPlan(locale, progress.complete ? "plan.progress.complete" : "plan.progress.partial", {
        done: progress.done,
        total: progress.total,
      });
  }
}

export function PlanPage() {
  const locale = useLocale();
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const { data: rawState, loading: stateLoading, error: stateError } = useTrainingState();
  const athleteId = settings?.activeAthleteId ?? DEFAULT_ATHLETE_ID;
  const [focus, setFocus, focusStatus] = usePlanFocus();
  const [history, setHistory] = useState<HistoryRead | null>(null);
  const [sources, setSources] = useState<readonly FeedbackSource[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => readHiddenFeedback());
  const [feedbackUnreadable, setFeedbackUnreadable] = useState(false);
  // Off (no listener at all) unless VITE_FEATURE_RACE_DAY is on.
  const raceEvents = useRaceWeekEvents();

  useEffect(() => {
    if (!uid) return;
    const db = getFirestoreDb();
    if (!db) return;
    let analyses: FeedbackSource[] = [];
    let equipment: FeedbackSource[] = [];
    const failed = { analyses: false, equipment: false };
    const publish = () => {
      setSources([...analyses, ...equipment]);
      setFeedbackUnreadable(failed.analyses || failed.equipment);
    };
    const stopAnalyses = subscribeToSavedAnalyses(
      db,
      uid,
      (rows) => {
        analyses = [...rows];
        failed.analyses = false;
        publish();
      },
      (error) => {
        logActionFailure("training-plan", "read-analysis", error);
        failed.analyses = true;
        publish();
      },
    );
    const stopEquipment = subscribeToEquipmentHistory(
      db,
      uid,
      DEFAULT_ATHLETE_ID,
      (rows) => {
        equipment = rows.flatMap((record) => {
          if (typeof record.id !== "string" || typeof record.createdAt !== "string") return [];
          return [
            {
              kind: "equipment" as const,
              id: record.id,
              createdAt: record.createdAt,
              findings: record.findings ?? [],
            },
          ];
        });
        failed.equipment = false;
        publish();
      },
      (error) => {
        logActionFailure("training-plan", "read-equipment", error);
        failed.equipment = true;
        publish();
      },
    );
    return () => {
      stopAnalyses();
      stopEquipment();
    };
  }, [uid]);

  const today = todayDateString();
  const monday = mondayOfWeek(today);
  const hasPastDays = today !== monday;
  const historyKey = `${uid ?? ""}:${athleteId}:${monday}:${today}`;
  const hasFocus = focus !== null;

  // The days of this week before today, from the day archive. One range read, released with the page.
  useEffect(() => {
    if (!uid || !hasFocus || !hasPastDays) return;
    const db = getFirestoreDb();
    if (!db) {
      setHistory({ key: historyKey, status: "error", days: new Map() });
      return;
    }
    return subscribeToTaskHistoryMonth(
      db,
      uid,
      athleteId,
      monday,
      previousDateString(today),
      (days) => setHistory({ key: historyKey, status: "ready", days: new Map(days.map((day) => [day.dateId, day.tasks])) }),
      (error) => {
        logActionFailure("training-plan", "read-history", error);
        setHistory({ key: historyKey, status: "error", days: new Map() });
      },
    );
  }, [uid, athleteId, hasFocus, hasPastDays, monday, today, historyKey]);

  const state = normalizeTrainingState(rawState ?? undefined);
  const pastRead: HistoryRead = !hasPastDays
    ? { key: historyKey, status: "ready", days: new Map() }
    : history?.key === historyKey
      ? history
      : { key: historyKey, status: "loading", days: new Map() };
  const days = focus ? planDays(focus) : [];
  const suggestions = deriveTrainingFeedback(sources).filter((item) => !hidden.has(trainingFeedbackKey(item)));
  const title = focus ? tPlan(locale, FOCUS_TITLE[focus]) : tPlan(locale, "plan.week.choose");
  // Race week suggestion: derived on every render and never stored. Until this week's focus is known
  // it is held back, because "no focus yet" would read as "not endurance" and could suggest it again.
  const focusKnown = !focusStatus.loading && !stateError;
  const raceSuggestions =
    raceEvents.status === "ready" && focusKnown
      ? deriveRaceWeekFeedback(raceEvents.events, today, focus).filter((item) => !hidden.has(trainingFeedbackKey(item)))
      : [];
  const raceUnreadable = raceEvents.status === "error";

  const ignoreSuggestion = (item: TrainingFeedback) => {
    const next = new Set(hidden);
    next.add(trainingFeedbackKey(item));
    setHidden(next);
    writeHiddenFeedback(next);
  };

  return (
    <div className="grid gap-6">
      {raceUnreadable || raceSuggestions.length > 0 ? (
        // First, ahead of the analysis suggestions: it expires with the race week, they do not.
        <section aria-labelledby="plan-race-feedback-title" className="grid gap-3">
          <h2 id="plan-race-feedback-title" className="text-lg font-bold text-brand-navy">
            {tPlan(locale, "plan.feedback.race.title")}
          </h2>
          {raceUnreadable ? <p role="status">{tPlan(locale, "plan.feedback.race.unavailable")}</p> : null}
          {raceSuggestions.map((item) => (
            <article key={trainingFeedbackKey(item)} className="grid gap-2 rounded-card border border-brand-navy/15 p-4">
              <p className="font-semibold text-brand-navy">{tPlan(locale, "plan.feedback.race")}</p>
              <p className="text-sm text-brand-navy/70">
                {tPlan(locale, "plan.feedback.source.race", { name: item.eventName, dates: raceDates(item, locale) })}
              </p>
              {item.datesPending ? (
                <p>
                  <StatusTag tone="pending">{tPlan(locale, "plan.feedback.race.pending")}</StatusTag>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => setFocus(item.focus)}>
                  {tPlan(locale, "plan.feedback.accept")}
                </Button>
                <Button type="button" variant="outline" onClick={() => ignoreSuggestion(item)}>
                  {tPlan(locale, "plan.feedback.ignore")}
                </Button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {feedbackUnreadable || suggestions.length > 0 ? (
        <section aria-labelledby="plan-feedback-title" className="grid gap-3">
          <h2 id="plan-feedback-title" className="text-lg font-bold text-brand-navy">
            {tPlan(locale, "plan.feedback.title")}
          </h2>
          {feedbackUnreadable ? <p role="status">{tPlan(locale, "plan.feedback.unavailable")}</p> : null}
          {suggestions.map((item) => {
            const date = analysisDay(item.createdAt, locale);
            const body =
              item.type === "review-equipment"
                ? "plan.feedback.equipment"
                : item.sourceKind === "pace"
                  ? "plan.feedback.pace"
                  : "plan.feedback.biomech";
            const source =
              item.sourceKind === "pace"
                ? "plan.feedback.source.pace"
                : item.sourceKind === "biomech"
                  ? "plan.feedback.source.biomech"
                  : "plan.feedback.source.equipment";
            return (
              <article key={trainingFeedbackKey(item)} className="grid gap-2 rounded-card border border-brand-navy/15 p-4">
                <p className="font-semibold text-brand-navy">{tPlan(locale, body)}</p>
                <p className="text-sm text-brand-navy/70">{tPlan(locale, source, { id: item.analysisId, date })}</p>
                <div className="flex flex-wrap gap-2">
                  {item.type === "set-focus" ? (
                    <Button type="button" onClick={() => setFocus(item.focus)}>
                      {tPlan(locale, "plan.feedback.accept")}
                    </Button>
                  ) : (
                    <Link
                      to="/analysis/equipment"
                      className="inline-flex min-h-11 items-center rounded-control border border-brand-navy/50 px-4 py-2 text-sm font-semibold text-brand-navy"
                    >
                      {tPlan(locale, "plan.feedback.equipment.link")}
                    </Link>
                  )}
                  <Button type="button" variant="outline" onClick={() => ignoreSuggestion(item)}>
                    {tPlan(locale, "plan.feedback.ignore")}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="grid content-start gap-4 lg:col-span-4">
        <header className="grid gap-2">
          <h1 className="text-xl font-bold text-brand-navy">{tPlan(locale, "plan.title")}</h1>
          <p className="text-sm text-brand-navy/80">{tPlan(locale, "plan.intro")}</p>
        </header>
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-brand-navy">{tPlan(locale, "plan.focus.label")}</p>
          {focusStatus.staleFocus ? (
            <div className="grid gap-2 rounded-card border border-brand-navy/15 p-3">
              <p className="text-sm text-brand-navy">
                {tPlan(locale, "plan.focus.stale", { title: tPlan(locale, FOCUS_TITLE[focusStatus.staleFocus]) })}
              </p>
              <Button type="button" variant="outline" onClick={() => setFocus(focusStatus.staleFocus!)}>
                {tPlan(locale, "plan.focus.staleConfirm")}
              </Button>
            </div>
          ) : null}
          {focusStatus.failed ? <p role="status" className="text-sm text-status-danger">{tPlan(locale, "plan.focus.saveFailed")}</p> : null}
          {PLAN_FOCUSES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={focus === item}
              className="min-h-11 rounded-card border border-brand-navy/20 px-4 py-3 text-left hover:bg-brand-ice"
              onClick={() => setFocus(item)}
            >
              <span className="block font-semibold text-brand-navy">{tPlan(locale, FOCUS_TITLE[item])}</span>
              <span className="mt-1 block text-sm text-brand-navy/70">{tPlan(locale, FOCUS_DETAIL[item])}</span>
            </button>
          ))}
          <p className="text-sm text-brand-navy/70">{tPlan(locale, "plan.basis")}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:col-span-8">
        <h2 className="text-lg font-bold text-brand-navy">
          {tPlan(locale, "plan.week", { week: PLAN_WEEK_NUMBER, title })}
        </h2>
        <p className="text-sm text-brand-navy/80">
          {focus ? tPlan(locale, FOCUS_SUMMARY[focus]) : tPlan(locale, "plan.week.disclaimer")}
        </p>
        {focus ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {days.map((day) => {
              const copy = dayCopy(day.id);
              const date = planDayDate(monday, day.id);
              const isToday = date === today;
              const progress = planDayProgress({
                date,
                today,
                generates: dayEntries(day.id).some((entry) => entry.generate !== false),
                state,
                archive: pastRead.days,
              });
              const line = progressLine(locale, progress, {
                isToday,
                isPast: date < today,
                stateLoading,
                stateFailed: Boolean(stateError),
                pastStatus: pastRead.status,
              });
              return (
                <li
                  key={day.id}
                  aria-current={isToday ? "date" : undefined}
                  className={`rounded-card border p-4 ${isToday ? "border-brand-navy" : "border-brand-navy/10"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-brand-navy">{tPlan(locale, copy.when)}</p>
                    <p className="text-sm text-brand-navy/80">
                      {formatCalendarDate(date, locale)}
                      {isToday ? ` · ${tPlan(locale, "plan.progress.today")}` : ""}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-brand-navy/80">
                    {tPlan(locale, copy.kind)}
                    {" · "}
                    {tPlan(locale, "plan.intensity")}
                    {tPlan(locale, copy.intensity)}
                  </p>
                  <p className="mt-2 text-sm text-brand-navy">{tPlan(locale, copy.body)}</p>
                  {line ? (
                    <p data-progress={progress.kind} className="mt-3 text-sm font-semibold text-brand-navy">
                      {line}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Card title={tPlan(locale, "plan.week.choose")}>
            <p>{tPlan(locale, focusStatus.loading ? "plan.focus.loading" : "plan.empty")}</p>
          </Card>
        )}
        {focus ? (
          <div className="grid gap-2 border-t border-brand-navy/10 pt-4">
            <p className="text-sm text-brand-navy/70">{tPlan(locale, "plan.note.progress")}</p>
            <p className="text-sm text-brand-navy/80">{tPlan(locale, "plan.note.generated")}</p>
            <p className="text-sm font-semibold text-brand-navy">{tPlan(locale, "plan.note.bonus")}</p>
            {stateError ? <p role="status" className="text-sm text-status-danger">{tPlan(locale, "plan.progress.stateFailed")}</p> : null}
            {pastRead.status === "error" ? (
              <p role="status" className="text-sm text-status-danger">{tPlan(locale, "plan.progress.historyFailed")}</p>
            ) : null}
            <Link
              to="/training/tasks"
              className="inline-flex min-h-11 w-fit items-center rounded-control border border-brand-navy/50 px-4 py-2 text-sm font-semibold text-brand-navy"
            >
              {tPlan(locale, "plan.note.tasksLink")}
            </Link>
          </div>
        ) : null}
      </section>
    </div>
    </div>
  );
}
