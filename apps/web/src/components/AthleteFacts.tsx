import type { AthleteProfile } from "@skatingx/schema";
import {
  formatSkatingDuration,
  getAgeCategory,
  getRealAge,
  getSkatingAge,
  getSkatingDuration,
  todayDateString,
} from "@skatingx/skating-domain";

import type { Locale } from "@/shared/i18n/translator";
import { tAthlete } from "@/shared/i18n/athlete-messages";

type AthleteFactsProps = {
  profile: AthleteProfile | null;
  loading: boolean;
  locale: Locale;
};

function factValue(loading: boolean, text: string | null): string {
  if (loading) {
    return "…";
  }
  return text ?? "—";
}

/** Age, skating age, category, then duration. The same four lines on the profile and the dashboard. */
export function AthleteFacts({ profile, loading, locale }: AthleteFactsProps) {
  const today = todayDateString();
  const birthDate = profile?.birthDate;
  const startDate = profile?.skatingStartDate;
  const realAge = !loading && birthDate ? getRealAge(birthDate, today) : null;
  const skatingAge = !loading && birthDate ? getSkatingAge(birthDate, today) : null;
  const category = skatingAge === null ? null : getAgeCategory(skatingAge, locale);
  const duration = !loading && startDate ? getSkatingDuration(startDate, today) : null;

  const rows: ReadonlyArray<{ key: string; label: string; value: string }> = [
    { key: "age", label: tAthlete(locale, "athlete.field.age"), value: factValue(loading, realAge === null ? null : String(realAge)) },
    { key: "skatingAge", label: tAthlete(locale, "athlete.field.skatingAge"), value: factValue(loading, skatingAge === null ? null : String(skatingAge)) },
    { key: "category", label: tAthlete(locale, "athlete.field.ageCategory"), value: factValue(loading, category) },
    {
      key: "duration",
      label: tAthlete(locale, "athlete.field.skatingDuration"),
      value: factValue(loading, duration ? formatSkatingDuration(duration, locale) : null),
    },
  ];

  return (
    <>
      {rows.map((row) => (
        <div key={row.key}>
          <dt className="text-brand-navy/70">{row.label}</dt>
          <dd className="font-medium text-brand-navy">{row.value}</dd>
        </div>
      ))}
    </>
  );
}
