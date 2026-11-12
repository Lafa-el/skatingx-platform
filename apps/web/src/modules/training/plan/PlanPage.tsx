import { getAcademyStage, getWeekdayRoutineItems, type AcademyStage, type WeekdayKey } from "@skatingx/content";
import { todayDateString } from "@skatingx/schema";
import {
  deriveRaceWeekFeedback,
  deriveTrainingFeedback,
  getRealAge,
  mondayOfWeek,
  normalizeTrainingState,
  PLAN_FOCUSES,
  PLAN_WEEK_NUMBER,
  planDayDate,
  planDayProgress,
  stageIdForRealAge,
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
import { useAthleteProfile, useTrainingState, useUserSettings } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { useRaceWeekEvents } from "@/hooks/useRaceWeekEvents";
import { formatCalendarDate } from "@/shared/i18n/format";
import { localized } from "@/shared/i18n/localized";
import { tPlan, type PlanMessageKey } from "@/shared/i18n/plan-messages";
import type { Locale } from "@/shared/i18n/translator";
import { activeAthleteIdOf } from "@/shared/activeAthleteId";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import { useHiddenFeedback, usePlanFocus } from "./plan-session";
import { PLAN_FOCUS_SHAPE } from "./plan-shape";

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

const WEEK_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const satisfies readonly WeekdayKey[];

const WEEKDAY_SUFFIX: Record<WeekdayKey, "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"> = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
};

function stageBodies(stage: "age4to7" | "age8to10" | "age11to13" | "age14to16"): Record<WeekdayKey, PlanMessageKey> {
  return {
    monday: `plan.stage.${stage}.mon.body`,
    tuesday: `plan.stage.${stage}.tue.body`,
    wednesday: `plan.stage.${stage}.wed.body`,
    thursday: `plan.stage.${stage}.thu.body`,
    friday: `plan.stage.${stage}.fri.body`,
    saturday: `plan.stage.${stage}.sat.body`,
    sunday: `plan.stage.${stage}.sun.body`,
  };
}

const STAGE_BODIES: Record<string, Record<WeekdayKey, PlanMessageKey>> = {
  age4_7: stageBodies("age4to7"),
  age8_10: stageBodies("age8to10"),
  age11_13: stageBodies("age11to13"),
  age14_16: stageBodies("age14to16"),
};

type ShownDay = {
  id: string;
  when: string;
  kind: string;
  intensity: PlanMessageKey;
  body: PlanMessageKey;
  generates: boolean;
};

const GENERIC_BODY: PlanMessageKey = "plan.stage.generic.body";

/**
 * One stage's cards, Monday through Sunday. Titles and durations come from that stage's day plans.
 * A recovery surface is shown and does not generate. A weekday with no routine is shown as rest.
 * A stage without its own lines uses the generic line.
 */
function stageDays(locale: Locale, focus: PlanFocus, stage: AcademyStage | null): ShownDay[] | null {
  if (!stage) return null;
  return WEEK_ORDER.map((weekday) => {
    const plan = stage.weeklyRoutine.dayPlans.find((item) => item.weekday === weekday);
    const shape = PLAN_FOCUS_SHAPE[focus][weekday];
    return {
      id: `${stage.id}_${WEEKDAY_SUFFIX[weekday]}`,
      when: plan
        ? `${localized(locale, { zh: plan.dayLabelZh, en: plan.dayLabelEn })} ${localized(locale, { zh: plan.durationZh, en: plan.durationEn })}`
        : "",
      kind: plan ? localized(locale, { zh: plan.titleZh, en: plan.titleEn }) : "",
      intensity: shape.intensity,
      body: STAGE_BODIES[stage.id]?.[weekday] ?? GENERIC_BODY,
      generates: shape.surface !== "recovery" && getWeekdayRoutineItems(stage, weekday).length > 0,
    };
  });
}

export function PlanPage() {
  const locale = useLocale();
  const { uid } = useAuth();
  const { data: settings } = useUserSettings();
  const { data: profile } = useAthleteProfile();
  const { data: rawState, loading: stateLoading, error: stateError } = useTrainingState();
  const athleteId = activeAthleteIdOf(settings);
  const [focus, setFocus, focusStatus] = usePlanFocus();
  const [history, setHistory] = useState<HistoryRead | null>(null);
  const [sources, setSources] = useState<readonly FeedbackSource[]>([]);
  const [hidden, setHidden] = useHiddenFeedback();
  const [feedbackUnreadable, setFeedbackUnreadable] = useState(false);
  // Off (no listener at all) unless VITE_FEATURE_RACE_DAY is on.
  const raceEvents = useRaceWeekEvents();

  useEffect(() => {
    if (!uid || !athleteId) return;
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
      athleteId,
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
      athleteId,
      (rows) => {
        equipment = rows.flatMap((record) => {
          if (typeof record.id !== "string" || typeof record.createdAt !== "string") return [];
          return [
            {
              kind: "equipment" as const,
              id: record.id,
              createdAt: record.createdAt,
              findings: record.findings ?? [],
              // Stored data: only a string is a key (anything else would be coerced when looked up).
              symptomKey: typeof record.symptomKey === "string" ? record.symptomKey : undefined,
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
  }, [uid, athleteId]);

  const today = todayDateString();
  // No birth date shows a prompt and generates no tasks.
  const stageId = profile?.birthDate ? stageIdForRealAge(getRealAge(profile.birthDate, today)) : null;
  const stage = stageId ? (getAcademyStage(stageId) ?? null) : null;
  const monday = mondayOfWeek(today);
  const hasPastDays = today !== monday;
  const historyKey = `${uid ?? ""}:${athleteId}:${monday}:${today}`;
  const hasFocus = focus !== null;

  // The days of this week before today, from the day archive. One range read, released with the page.
  useEffect(() => {
    if (!uid || !athleteId || !hasFocus || !hasPastDays) return;
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
  const days = !focus ? [] : (stageDays(locale, focus, stage) ?? []);
  const suggestions = deriveTrainingFeedback(sources, focus).filter((item) => !hidden.has(trainingFeedbackKey(item)));
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
          <h1 className="text-xl font-bold text-brand-navy">
            {stage
              ? localized(locale, {
                  zh: `${stage.labelZh}（${stage.ageRangeZh}）`,
                  en: `${stage.labelEn} (${stage.ageRangeEn})`,
                })
              : tPlan(locale, "plan.title.generic")}
          </h1>
          <p className="text-sm text-brand-navy/80">{tPlan(locale, "plan.intro")}</p>
        </header>
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-brand-navy">{tPlan(locale, "plan.focus.label")}</p>
          {focus ? <p className="text-sm text-brand-navy/70">{tPlan(locale, "plan.focus.nextDayNote")}</p> : null}
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
        {!focus ? (
          <Card title={tPlan(locale, "plan.week.choose")}>
            <p>{tPlan(locale, focusStatus.loading ? "plan.focus.loading" : "plan.empty")}</p>
          </Card>
        ) : !stage ? (
          <p role="status">{tPlan(locale, "plan.noStage")}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {days.map((day) => {
              const date = planDayDate(monday, day.id);
              const isToday = date === today;
              const progress = planDayProgress({
                date,
                today,
                generates: day.generates,
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
                    <p className="font-semibold text-brand-navy">{day.when}</p>
                    <p className="text-sm text-brand-navy/80">
                      {formatCalendarDate(date, locale)}
                      {isToday ? ` · ${tPlan(locale, "plan.progress.today")}` : ""}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-brand-navy/80">
                    {day.kind}
                    {" · "}
                    {tPlan(locale, "plan.intensity")}
                    {tPlan(locale, day.intensity)}
                  </p>
                  <p className="mt-2 text-sm text-brand-navy">{tPlan(locale, day.body)}</p>
                  {line ? (
                    <p data-progress={progress.kind} className="mt-3 text-sm font-semibold text-brand-navy">
                      {line}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
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
