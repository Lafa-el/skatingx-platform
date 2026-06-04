import { Card } from "@skatingx/ui";

import { useActiveAthlete } from "@/app/providers/activeAthleteContext";
import { AthleteSelector } from "@/components/AthleteSelector";

export function AthletePage() {
  const { activeAthlete, athletes } = useActiveAthlete();

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Athlete</h1>
          <p className="mt-1 text-slate-600">
            Manage the active skater for training and analysis.
          </p>
        </div>
        <AthleteSelector />
      </div>

      <Card title="Active profile" className="mt-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium text-slate-900">
              {activeAthlete.displayName}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Athlete ID</dt>
            <dd className="font-medium text-slate-900">
              {activeAthlete.athleteId}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Birth date</dt>
            <dd className="font-medium text-slate-900">
              {activeAthlete.birthDate}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Roster (placeholder)" className="mt-4">
        <ul className="divide-y divide-slate-100 text-sm">
          {athletes.map((athlete) => (
            <li
              key={athlete.athleteId}
              className="flex items-center justify-between py-2"
            >
              <span>
                {athlete.displayName}
                <span className="ml-2 text-slate-500">
                  ({athlete.athleteId})
                </span>
              </span>
              {athlete.athleteId === activeAthlete.athleteId ? (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                  Active
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Firestore sync and create-athlete flow are not implemented yet.
        </p>
      </Card>
    </section>
  );
}
