import { Card } from "@skatingx/ui";

import { useAuth } from "@/app/providers/AuthProvider";
import { AthleteSelector } from "@/components/AthleteSelector";
import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useActiveAthlete,
  useAthleteProfile,
  useUserSettings,
} from "@/hooks/firestore";
import { useLocale } from "@/hooks/useLocale";
import { tAthlete } from "@/shared/i18n/athlete-messages";
import { formatCalendarDate } from "@/shared/i18n/format";

export function AthletePage() {
  const locale = useLocale();
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
          <h1 className="text-2xl font-bold text-slate-900">
            {tAthlete(locale, "athlete.title")}
          </h1>
          <p className="mt-1 text-slate-600">
            {tAthlete(locale, "athlete.subtitle")}
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

      <Card title={tAthlete(locale, "athlete.profile.title")} className="mt-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">{tAthlete(locale, "athlete.field.name")}</dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : (profile?.displayName ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">
              {tAthlete(locale, "athlete.field.birthDate")}
            </dt>
            <dd className="font-medium text-slate-900">
              {loading
                ? "…"
                : profile?.birthDate
                  ? formatCalendarDate(profile.birthDate, locale)
                  : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{tAthlete(locale, "athlete.field.sport")}</dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : (profile?.sport ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">
              {tAthlete(locale, "athlete.field.country")}
            </dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : (profile?.country ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">
              {tAthlete(locale, "athlete.field.activeId")}
            </dt>
            <dd className="font-medium text-slate-900">
              {loading ? "…" : (settings?.activeAthleteId ?? athleteId)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">
              {tAthlete(locale, "athlete.field.accountUid")}
            </dt>
            <dd className="font-mono text-xs text-slate-800 break-all">
              {uid ?? "—"}
            </dd>
          </div>
        </dl>
      </Card>
    </section>
  );
}
