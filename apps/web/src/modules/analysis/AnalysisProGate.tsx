import type { ReactNode } from "react";
import { ErrorNotice } from "@skatingx/ui";

import { useIsPro } from "@/hooks/useIsPro";
import { useLocale } from "@/hooks/useLocale";
import { tAnalysis } from "@/shared/i18n/analysis-messages";
import { tSettingsPage } from "@/shared/i18n/settings-page-messages";

type AnalysisProGateProps = {
  children: ReactNode;
};

/**
 * Renders analysis pages only for PRO users. Children are not mounted while locked, so their
 * Firestore listeners are never created.
 *
 * `settings/main.isPro` is a client-writable convenience flag. Security Rules do not read it,
 * so this gate is not a boundary and must not be described as protection. A failed read stays
 * locked: opening pages we could not confirm is worse than asking for a retry. Loading is its
 * own state so a PRO user never sees the locked card flash before settings arrive.
 */
export function AnalysisProGate({ children }: AnalysisProGateProps) {
  const locale = useLocale();
  const { isPro, loading, error } = useIsPro();

  if (!loading && !error && isPro) {
    return <>{children}</>;
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-navy">{tAnalysis(locale, "analysis.pro.heading")}</h1>
      {loading ? (
        <p role="status" className="text-sm text-brand-navy/70">
          {tSettingsPage(locale, "settings.plan.preparing")}
        </p>
      ) : (
        <div className="space-y-3 rounded-card border border-brand-navy/10 bg-white p-4 shadow-card">
          <h2 className="text-lg font-semibold text-brand-navy">{tAnalysis(locale, "analysis.pro.title")}</h2>
          {error ? (
            <ErrorNotice>
              {tSettingsPage(locale, "settings.plan.error")}
              {tAnalysis(locale, "analysis.pro.errorRest")}
            </ErrorNotice>
          ) : (
            <p className="text-sm text-brand-navy">
              {tAnalysis(locale, "analysis.pro.belongs", {
                benefit: tSettingsPage(locale, "settings.plan.benefit.analysis"),
              })}
            </p>
          )}
          <p className="text-sm text-brand-navy/70">{tSettingsPage(locale, "settings.plan.manual")}</p>
        </div>
      )}
    </section>
  );
}
