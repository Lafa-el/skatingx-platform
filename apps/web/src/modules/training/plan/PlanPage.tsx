import { DEFAULT_ATHLETE_ID } from "@skatingx/schema";
import {
  deriveTrainingFeedback,
  PLAN_FOCUSES,
  PLAN_WEEK_NUMBER,
  planDays,
  trainingFeedbackKey,
  weeklyCheckedPoints,
  type FeedbackSource,
  type PlanFocus,
  type TrainingFeedback,
} from "@skatingx/skating-domain";
import {
  completePlanningCheckIn,
  getFirestoreDb,
  subscribeToEquipmentHistory,
  subscribeToPlanningCheckIns,
  subscribeToSavedAnalyses,
  type PlanningCheckIn,
} from "@skatingx/firebase-client";
import { Button, Card } from "@skatingx/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { useGamification } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tPlan, type PlanMessageKey } from "@/shared/i18n/plan-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import { dayCopy } from "./plan-day-copy";
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

export function PlanPage() {
  const locale = useLocale();
  const { uid } = useAuth();
  const gamification = useGamification();
  const [focus, setFocus] = usePlanFocus();
  const [checkIns, setCheckIns] = useState<readonly PlanningCheckIn[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [status, setStatus] = useState<PlanMessageKey | null>(null);
  const [sources, setSources] = useState<readonly FeedbackSource[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => readHiddenFeedback());
  const [feedbackUnreadable, setFeedbackUnreadable] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const db = getFirestoreDb();
    if (!db) return;
    return subscribeToPlanningCheckIns(
      db,
      uid,
      DEFAULT_ATHLETE_ID,
      setCheckIns,
      (error) => logActionFailure("training-plan", "listen", error),
    );
  }, [uid]);

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

  const completed = new Set(checkIns.map((item) => item.taskId));
  const days = focus ? planDays(focus) : [];
  const weekly = focus ? weeklyCheckedPoints(focus, completed) : 0;
  const suggestions = deriveTrainingFeedback(sources).filter((item) => !hidden.has(trainingFeedbackKey(item)));
  const title = focus ? tPlan(locale, FOCUS_TITLE[focus]) : tPlan(locale, "plan.week.choose");
  const balance = gamification.loading ? "…" : String(gamification.data?.points ?? 0);

  const checkIn = async (taskId: string) => {
    if (!uid || pendingId) return;
    const db = getFirestoreDb();
    if (!db) {
      setFailedId(taskId);
      setStatus("plan.check.offline");
      return;
    }
    setPendingId(taskId);
    setFailedId(null);
    setStatus(null);
    try {
      await completePlanningCheckIn(db, uid, DEFAULT_ATHLETE_ID, taskId);
    } catch (error) {
      logActionFailure("training-plan", "check-in", error);
      setFailedId(taskId);
      setStatus("plan.check.retry");
    } finally {
      setPendingId(null);
    }
  };

  const ignoreSuggestion = (item: TrainingFeedback) => {
    const next = new Set(hidden);
    next.add(trainingFeedbackKey(item));
    setHidden(next);
    writeHiddenFeedback(next);
  };

  return (
    <div className="grid gap-6">
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
      <section className="grid gap-4 lg:col-span-4">
        <header className="grid gap-2">
          <h1 className="text-xl font-bold text-brand-navy">{tPlan(locale, "plan.title")}</h1>
          <p className="text-sm text-brand-navy/80">{tPlan(locale, "plan.intro")}</p>
        </header>
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-brand-navy">{tPlan(locale, "plan.focus.label")}</p>
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
              const done = completed.has(day.id);
              const pending = pendingId === day.id;
              const failed = failedId === day.id && !done;
              const label = done
                ? "plan.check.done"
                : pending
                  ? "plan.check.pending"
                  : failed
                    ? "plan.check.retry"
                    : "plan.check.in";
              return (
                <li key={day.id} className="rounded-card border border-brand-navy/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-brand-navy">{tPlan(locale, copy.when)}</p>
                    <p className="font-mono text-sm text-brand-navy">{tPlan(locale, "plan.pointsBadge", { points: day.points })}</p>
                  </div>
                  <p className="mt-2 text-sm text-brand-navy/80">
                    {tPlan(locale, copy.kind)}
                    {" · "}
                    {tPlan(locale, "plan.intensity")}
                    {tPlan(locale, copy.intensity)}
                  </p>
                  <p className="mt-2 text-sm text-brand-navy">{tPlan(locale, copy.body)}</p>
                  <Button className="mt-3 w-full" disabled={done || pending} onClick={() => void checkIn(day.id)}>
                    {tPlan(locale, label)}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Card title={tPlan(locale, "plan.week.choose")}>
            <p>{tPlan(locale, "plan.empty")}</p>
          </Card>
        )}
        {focus ? (
          <div className="grid gap-2 border-t border-brand-navy/10 pt-4">
            <p className="text-sm text-brand-navy/70">{tPlan(locale, "plan.check.note")}</p>
            <p className="font-semibold text-brand-navy">
              {tPlan(locale, "plan.week.points")} {weekly}
            </p>
            <p className="font-semibold text-brand-navy">
              {tPlan(locale, "plan.balance")} {balance}
            </p>
            {status ? <p role="status">{tPlan(locale, status)}</p> : null}
          </div>
        ) : null}
      </section>
    </div>
    </div>
  );
}
