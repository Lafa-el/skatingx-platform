import { Link } from "react-router-dom";
import { normalizeTrainingState } from "@skatingx/firebase-client";
import { formatSecondsToTime } from "@skatingx/skating-domain";
import { Card } from "@skatingx/ui";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useAthleteProfile,
  useGamification,
  useTrainingState,
} from "@/app/providers/FirestoreProvider";
import { useIsPro } from "@/hooks/useIsPro";
import { useRewardsShop } from "@/hooks/useRewardsShop";
import { useTrainingRecords } from "@/hooks/useTrainingRecords";

const dashboardCards = [
  {
    title: "Today's Training",
    body: "View and complete today's task list.",
    to: "/training/tasks",
  },
  {
    title: "Latest Analysis",
    body: "Biomechanics, pacing, and equipment insights.",
    to: "/analysis",
  },
  {
    title: "Athlete Profile",
    body: "Profile, division, and avatar settings.",
    to: "/athlete",
  },
  {
    title: "AI Coach Recommendation",
    body: "Personalized coaching suggestions from your data.",
    to: "/ai-coach",
  },
] as const;

export function DashboardPage() {
  const { data: profile, loading: profileLoading, error: profileError } =
    useAthleteProfile();
  const {
    data: gamification,
    loading: gamificationLoading,
    error: gamificationError,
  } = useGamification();
  const {
    data: rawState,
    loading: trainingLoading,
    error: trainingError,
  } = useTrainingState();
  const {
    loading: recordsLoading,
    error: recordsError,
    getBestForDistance,
    latestEntryOverall,
  } = useTrainingRecords();
  const { isPro, loading: proLoading } = useIsPro();
  const {
    latestRedemption,
    loading: shopLoading,
    error: shopError,
  } = useRewardsShop();

  const loading =
    profileLoading ||
    gamificationLoading ||
    trainingLoading ||
    recordsLoading ||
    proLoading ||
    shopLoading;
  const error =
    profileError ??
    gamificationError ??
    trainingError ??
    recordsError ??
    shopError;

  const state = rawState ? normalizeTrainingState(rawState) : null;
  const tasks = state?.todayTasks ?? [];
  const completedCount = tasks.filter((t) => t.completed).length;
  const taskCount = tasks.length;

  const name = profile?.displayName ?? "…";
  const points = gamification?.points ?? 0;
  const streakDays = gamification?.streakDays ?? 0;
  const pb500 = getBestForDistance("500m");
  const pbFastestLap = getBestForDistance("fastest_lap");

  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-slate-600">
        {loading ? "Loading your dashboard…" : `Welcome back, ${name}`}
      </p>

      <FirestoreStatusBanner className="mt-4" />

      {error ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Athlete">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : name}
          </p>
        </Card>
        <Card title="Points">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : points}
          </p>
        </Card>
        <Card title="Streak">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : `${streakDays} days`}
          </p>
        </Card>
        <Card title="Today's tasks">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : `${completedCount} / ${taskCount}`}
          </p>
          <p className="mt-1 text-xs text-slate-500">completed / total</p>
        </Card>
        <Card title="500m PB">
          <p className="text-lg font-semibold font-mono text-slate-900">
            {loading ? "…" : pb500 ? formatSecondsToTime(pb500.timeSeconds) : "—"}
          </p>
          {pb500 ? (
            <p className="mt-1 text-xs text-slate-500">{pb500.date}</p>
          ) : null}
        </Card>
        <Card title="Fastest lap PB">
          <p className="text-lg font-semibold font-mono text-slate-900">
            {loading
              ? "…"
              : pbFastestLap
                ? formatSecondsToTime(pbFastestLap.timeSeconds)
                : "—"}
          </p>
          {pbFastestLap ? (
            <p className="mt-1 text-xs text-slate-500">{pbFastestLap.date}</p>
          ) : null}
        </Card>
        <Card title="Plan">
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : isPro ? "PRO active" : "Free plan"}
          </p>
        </Card>
        <Card title="Latest redemption">
          <p className="text-lg font-semibold text-slate-900">
            {loading
              ? "…"
              : latestRedemption
                ? latestRedemption.rewardName
                : "—"}
          </p>
          {latestRedemption ? (
            <p className="mt-1 text-xs text-slate-500">
              −{latestRedemption.cost} pts · {latestRedemption.redeemedAt.slice(0, 10)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No redemptions yet</p>
          )}
        </Card>
        <Card title="Latest record">
          <p className="text-lg font-semibold font-mono text-slate-900">
            {loading
              ? "…"
              : latestEntryOverall
                ? formatSecondsToTime(latestEntryOverall.timeSeconds)
                : "—"}
          </p>
          {latestEntryOverall ? (
            <p className="mt-1 text-xs text-slate-500">{latestEntryOverall.date}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No entries yet</p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {dashboardCards.map((card) => (
          <Link key={card.title} to={card.to} className="block no-underline">
            <Card title={card.title}>
              <p>{card.body}</p>
              <span className="mt-2 inline-block text-sm font-medium text-sky-700">
                Open →
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
