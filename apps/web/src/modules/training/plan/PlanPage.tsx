import { DEFAULT_ATHLETE_ID } from "@skatingx/schema";
import {
  PLAN_FOCUSES,
  PLAN_WEEK_NUMBER,
  planDays,
  weeklyCheckedPoints,
  type PlanFocus,
} from "@skatingx/skating-domain";
import {
  completePlanningCheckIn,
  getFirestoreDb,
  subscribeToPlanningCheckIns,
  type PlanningCheckIn,
} from "@skatingx/firebase-client";
import { Button, Card } from "@skatingx/ui";
import { useEffect, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useGamification } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { tPlan, type PlanMessageKey } from "@/shared/i18n/plan-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import { dayCopy } from "./plan-day-copy";

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

export function PlanPage() {
  const locale = useLocale();
  const { uid } = useAuth();
  const gamification = useGamification();
  const [focus, setFocus] = useState<PlanFocus | null>(null);
  const [checkIns, setCheckIns] = useState<readonly PlanningCheckIn[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [status, setStatus] = useState<PlanMessageKey | null>(null);

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

  const completed = new Set(checkIns.map((item) => item.taskId));
  const days = focus ? planDays(focus) : [];
  const weekly = focus ? weeklyCheckedPoints(focus, completed) : 0;
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

  return (
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
  );
}
