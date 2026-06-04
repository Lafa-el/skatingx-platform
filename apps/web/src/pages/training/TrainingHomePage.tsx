import { Link } from "react-router-dom";
import { getAcademyStages, localizeStageLabel } from "@skatingx/content";
import { normalizeTrainingState } from "@skatingx/firebase-client";
import { formatSecondsToTime } from "@skatingx/skating-domain";
import { Card } from "@skatingx/ui";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useAthleteProfile,
  useGamification,
  useTrainingState,
  useUserSettings,
} from "@/app/providers/FirestoreProvider";
import { useIsPro } from "@/hooks/useIsPro";
import { useTrainingRecords } from "@/hooks/useTrainingRecords";

export function TrainingHomePage() {
  const { data: settings } = useUserSettings();
  const { data: profile, loading: profileLoading } = useAthleteProfile();
  const { data: gamification, loading: gamificationLoading } = useGamification();
  const { data: rawState, loading: stateLoading, error } = useTrainingState();
  const {
    loading: recordsLoading,
    error: recordsError,
    totalEntryCount,
    getBestForDistance,
  } = useTrainingRecords();
  const { isPro, loading: proLoading } = useIsPro();

  const loading =
    profileLoading || gamificationLoading || stateLoading || recordsLoading || proLoading;
  const recordsErr = recordsError;
  const state = rawState ? normalizeTrainingState(rawState) : null;
  const tasks = state?.todayTasks ?? [];
  const completed = tasks.filter((t) => t.completed).length;
  const pb500 = getBestForDistance("500m");
  const language = settings?.language === "en" ? "en" : "zh";
  const defaultStage = getAcademyStages()[1] ?? getAcademyStages()[0];
  const academyLabel = defaultStage
    ? localizeStageLabel(defaultStage, language)
    : "Academy";

  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">Training</h1>
      <p className="mt-1 text-slate-600">
        Daily tasks, academy, records, and shop — tasks are live on Firestore.
      </p>

      <FirestoreStatusBanner className="mt-4" />

      {error || recordsErr ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error ?? recordsErr}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card title="Athlete">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : (profile?.displayName ?? "—")}
          </p>
        </Card>
        <Card title="Points">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : (gamification?.points ?? 0)}
          </p>
        </Card>
        <Card title="Streak">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : `${gamification?.streakDays ?? 0} days`}
          </p>
        </Card>
        <Card title="Today's tasks">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : `${completed} / ${tasks.length}`}
          </p>
          <Link
            to="/training/tasks"
            className="mt-2 inline-block text-sm font-medium text-sky-700"
          >
            Open task list →
          </Link>
        </Card>
        <Card title="Records">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : `${totalEntryCount} entries`}
          </p>
          <p className="mt-1 font-mono text-sm text-slate-600">
            {loading ? "…" : pb500 ? `500m PB ${formatSecondsToTime(pb500.timeSeconds)}` : "No 500m PB yet"}
          </p>
          <Link
            to="/training/records"
            className="mt-2 inline-block text-sm font-medium text-sky-700"
          >
            Open records →
          </Link>
        </Card>
      </div>

      <Card title="Shop / Rewards" className="mt-4">
        <p className="text-lg font-semibold text-slate-900">
          {loading ? "…" : `${gamification?.points ?? 0} points`}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {loading
            ? "…"
            : isPro
              ? language === "en"
                ? "PRO active · catalog + custom rewards (placeholder)"
                : "PRO 已开启 · 目录奖励 + 自定义奖励（占位）"
              : language === "en"
                ? "Free plan · catalog rewards only"
                : "免费版 · 仅目录奖励"}
        </p>
        <Link
          to="/training/shop"
          className="mt-2 inline-block text-sm font-medium text-sky-700"
        >
          Open shop →
        </Link>
      </Card>

      <Card title="Academy" className="mt-4">
        <p className="text-sm text-slate-600">
          {defaultStage
            ? language === "en"
              ? `Reference stage: ${academyLabel} (${defaultStage.ageRange})`
              : `参考阶段：${academyLabel}（${defaultStage.ageRange}）`
            : "Import dryland training from BLAZE Academy."}
        </p>
        <Link
          to="/training/academy"
          className="mt-2 inline-block text-sm font-medium text-sky-700"
        >
          Open academy →
        </Link>
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link to="/training/tasks" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
          <span className="font-medium text-slate-900">Tasks</span>
          <p className="mt-1 text-sm text-slate-600">Add and complete today&apos;s list</p>
        </Link>
        <Link to="/training/academy" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
          <span className="font-medium text-slate-900">Academy</span>
          <p className="mt-1 text-sm text-slate-600">
            {defaultStage ? `${academyLabel} · dryland plans` : "BLAZE Academy"}
          </p>
        </Link>
        <Link to="/training/records" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
          <span className="font-medium text-slate-900">Records</span>
          <p className="mt-1 text-sm text-slate-600">PB times by distance</p>
        </Link>
        <Link to="/training/shop" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
          <span className="font-medium text-slate-900">Shop</span>
          <p className="mt-1 text-sm text-slate-600">
            {loading ? "…" : `${gamification?.points ?? 0} points available`}
          </p>
        </Link>
      </div>
    </section>
  );
}
