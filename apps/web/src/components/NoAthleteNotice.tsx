import { Link } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";
import { tAthlete } from "@/shared/i18n/athlete-messages";

/** Shown where a page would otherwise read an athlete that is not there. */
export function NoAthleteNotice({ heading = true }: { heading?: boolean }) {
  const locale = useLocale();
  return (
    <div>
      {heading ? (
        <p className="font-medium text-brand-navy">{tAthlete(locale, "athlete.empty.title")}</p>
      ) : null}
      <p className="mt-1 text-sm text-brand-navy/70">{tAthlete(locale, "athlete.empty.body")}</p>
      <Link
        to="/athlete"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2"
      >
        {tAthlete(locale, "athlete.action.add")}
      </Link>
    </div>
  );
}
