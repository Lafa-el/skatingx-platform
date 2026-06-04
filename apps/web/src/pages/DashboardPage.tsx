import { Link } from "react-router-dom";
import { Card } from "@skatingx/ui";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useAthleteProfile,
  useGamification,
  useTrainingState,
} from "@/hooks/firestore";

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
    data: training,
    loading: trainingLoading,
    error: trainingError,
  } = useTrainingState();

  const loading = profileLoading || gamificationLoading || trainingLoading;
  const error = profileError ?? gamificationError ?? trainingError;

  const name = profile?.displayName ?? "…";
  const points = gamification?.points ?? 0;
  const streakDays = gamification?.streakDays ?? 0;
  const taskCount = training?.todayTasks?.length ?? 0;

  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-slate-600">
        {loading
          ? "Loading your dashboard…"
          : `Welcome back, ${name}`}
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

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
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
            {loading ? "…" : taskCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">items on today&apos;s list</p>
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
