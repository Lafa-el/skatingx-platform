import type { ReactNode } from "react";

import { useLocale } from "@/hooks/useLocale";
import { tSettingsPage } from "@/shared/i18n/settings-page-messages";

import { useProAccess } from "../hooks/useProAccess";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import { FormMessage, SURFACE_CARD } from "./fields";

type ProGateProps = {
  /** Heading of the page behind the gate, so the locked state still names where you are. */
  titleKey: RaceDayMessageKey;
  children: ReactNode;
};

/**
 * Renders `children` only for PRO users. Children are not mounted while locked, so their
 * Firestore listeners are never created: a free user's device reads no video or summary data.
 *
 * The locked card links nowhere and does not write `isPro`. Who may open the page is the same
 * read as every other surface: `settings/main.isPro`.
 */
export function ProGate({ titleKey, children }: ProGateProps) {
  const locale = useLocale();
  const access = useProAccess();

  if (access === "unlocked") {
    return <>{children}</>;
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-navy">{t(locale, titleKey)}</h1>
      {access === "loading" ? (
        <p role="status" className="text-sm text-brand-navy/70">
          {tSettingsPage(locale, "settings.plan.preparing")}
        </p>
      ) : (
        <div className={`space-y-3 ${SURFACE_CARD}`}>
          <h2 className="text-lg font-semibold text-brand-navy">{t(locale, "raceDay.pro.title")}</h2>
          {access === "error" ? (
            <FormMessage tone="error">
              {tSettingsPage(locale, "settings.plan.error")}
              {t(locale, "raceDay.pro.errorRest")}
            </FormMessage>
          ) : (
            <p className="text-sm text-brand-navy">
              {t(locale, "raceDay.pro.belongs", {
                benefit: tSettingsPage(locale, "settings.plan.benefit.videos"),
              })}
            </p>
          )}
          <p className="text-sm text-brand-navy/70">{tSettingsPage(locale, "settings.plan.manual")}</p>
        </div>
      )}
    </section>
  );
}
