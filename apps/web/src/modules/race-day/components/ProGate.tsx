import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";

import { useProAccess } from "../hooks/useProAccess";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import { FormMessage, PRIMARY_BUTTON } from "./fields";

type ProGateProps = {
  /** Heading of the page behind the gate, so the locked state still names where you are. */
  titleKey: RaceDayMessageKey;
  children: ReactNode;
};

/**
 * Renders `children` only for PRO users. Children are not mounted while locked, so their
 * Firestore listeners are never created: a free user's device reads no video or summary data.
 */
export function ProGate({ titleKey, children }: ProGateProps) {
  const locale = useLocale();
  const access = useProAccess();

  if (access === "unlocked") {
    return <>{children}</>;
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t(locale, titleKey)}</h1>
      {access === "loading" ? (
        <p role="status" className="text-sm text-slate-600">
          {t(locale, "raceDay.pro.preparing")}
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">{t(locale, "raceDay.pro.title")}</h2>
          {access === "error" ? (
            <FormMessage tone="error">{t(locale, "raceDay.pro.error")}</FormMessage>
          ) : (
            <p className="text-sm text-slate-700">{t(locale, "raceDay.pro.body")}</p>
          )}
          <p className="text-sm text-slate-500">{t(locale, "raceDay.pro.provisional")}</p>
          <Link to="/settings" className={PRIMARY_BUTTON + " inline-block"}>
            {t(locale, "raceDay.pro.settingsLink")}
          </Link>
        </div>
      )}
    </section>
  );
}
