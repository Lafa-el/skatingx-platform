import { Card } from "@skatingx/ui";

import { useAuth } from "@/app/providers/AuthProvider";
import { AthleteSelector } from "@/components/AthleteSelector";
import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useActiveAthlete,
  useAthleteProfile,
  useUserSettings,
} from "@/hooks/firestore";

export function AthletePage() {
  const { uid } = useAuth();
  const { athleteId, loading: activeLoading, error: activeError } =
    useActiveAthlete();
  const { data: profile, loading: profileLoading, error: profileError } =
    useAthleteProfile();
  const { data: settings, loading: settingsLoading, error: settingsError } =
    useUserSettings();

  const loading = activeLoading || profileLoading || settingsLoading;
  const error = activeError ?? profileError ?? settingsError;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Athlete</h1>
          <p className="mt-1 text-slate-600">
            Profile loaded from Firestore for the active skater.
          </p>
        </div>
        <AthleteSelector />
      </div>

      <FirestoreStatusBanner className="mt-4" />

      {error ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Card title="Active profile" className="mt-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : (profile?.displayName ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Birth date</dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : (profile?.birthDate ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Sport</dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : (profile?.sport ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Country</dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : (profile?.country ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Active athlete ID</dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : (settings?.activeAthleteId ?? athleteId)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Account UID</dt>
            <dd className="font-mono text-xs text-slate-800 break-all">
              {uid ?? "—"}
            </dd>
          </div>
        </dl>
      </Card>
    </section>
  );
}
