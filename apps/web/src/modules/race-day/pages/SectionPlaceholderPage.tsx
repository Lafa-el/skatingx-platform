import { useLocale } from "@/hooks/useLocale";

import { t, type RaceDayMessageKey } from "../i18n/messages";

type SectionPlaceholderPageProps = {
  titleKey: RaceDayMessageKey;
};

/**
 * Honest placeholder for a section whose slice has not shipped. It says so instead of
 * showing sample data that could be mistaken for real race information.
 */
export function SectionPlaceholderPage({ titleKey }: SectionPlaceholderPageProps) {
  const locale = useLocale();
  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">{t(locale, titleKey)}</h1>
      <p className="mt-2 text-slate-600">{t(locale, "raceDay.placeholder.notAvailable")}</p>
    </section>
  );
}
