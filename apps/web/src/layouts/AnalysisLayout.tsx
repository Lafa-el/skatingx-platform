import { Outlet } from "react-router-dom";

import { getAnalysisSubNav } from "@/app/navigation";
import { NoAthleteNotice } from "@/components/NoAthleteNotice";
import { SubNav } from "@/components/SubNav";
import { useActiveAthlete } from "@/hooks/firestore";
import { useLocale } from "@/hooks/useLocale";
import { ShellFrame } from "@/layouts/ShellFrame";
import { AnalysisProGate } from "@/modules/analysis/AnalysisProGate";
import { tNav } from "@/shared/i18n/nav-messages";

export function AnalysisLayout() {
  const locale = useLocale();
  const { athleteId, loading, error } = useActiveAthlete();

  return (
    <ShellFrame subNav={<SubNav items={getAnalysisSubNav(locale)} label={tNav(locale, "nav.analysis.section")} />}>
      {/* One gate for every /analysis route. The section tabs stay; the page does not mount while locked. */}
      <AnalysisProGate>
        {loading || error ? null : athleteId == null ? <NoAthleteNotice /> : <Outlet />}
      </AnalysisProGate>
    </ShellFrame>
  );
}
