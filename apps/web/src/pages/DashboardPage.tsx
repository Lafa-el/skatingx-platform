import { Link } from "react-router-dom";
import { Card } from "@skatingx/ui";

import { useActiveAthlete } from "@/app/providers/activeAthleteContext";

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
  const { activeAthlete } = useActiveAthlete();

  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-slate-600">
        Welcome back, {activeAthlete.displayName} ({activeAthlete.athleteId})
      </p>

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
