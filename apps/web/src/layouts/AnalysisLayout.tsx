import { Outlet } from "react-router-dom";

import { getAnalysisSubNav } from "@/app/navigation";
import { SubNav } from "@/components/SubNav";
import { useLocale } from "@/hooks/useLocale";
import { ShellFrame } from "@/layouts/ShellFrame";
import { AnalysisProGate } from "@/modules/analysis/AnalysisProGate";
import { tNav } from "@/shared/i18n/nav-messages";

export function AnalysisLayout() {
  const locale = useLocale();

  return (
    <ShellFrame subNav={<SubNav items={getAnalysisSubNav(locale)} label={tNav(locale, "nav.analysis.section")} />}>
      {/* One gate for every /analysis route. The section tabs stay; the page does not mount while locked. */}
      <AnalysisProGate>
        <Outlet />
      </AnalysisProGate>
    </ShellFrame>
  );
}
