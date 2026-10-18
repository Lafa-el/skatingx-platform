import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";
import { tCore } from "@/modules/race-day/i18n/core-messages";

import { isRaceDayEnabled } from "./features";

// Route-level lazy load: the module (layout, pages, text) is a separate chunk and is not
// downloaded unless the flag is on and the user opens /race-day (AGENTS.md, ADR-001 D3).
const RaceDayModule = lazy(() => import("@/modules/race-day/RaceDayModule"));

export function RaceDayRoute() {
  const locale = useLocale();

  // Flag off: behave like any unknown route. The module is never requested.
  if (!isRaceDayEnabled()) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-brand-navy/70">
          {tCore(locale, "raceDay.state.loading")}
        </p>
      }
    >
      <RaceDayModule />
    </Suspense>
  );
}
