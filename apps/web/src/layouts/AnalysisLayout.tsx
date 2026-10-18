import { Outlet } from "react-router-dom";

import { getAnalysisSubNav } from "@/app/navigation";
import { SubNav } from "@/components/SubNav";
import { useLocale } from "@/hooks/useLocale";
import { ShellFrame } from "@/layouts/ShellFrame";
import { tNav } from "@/shared/i18n/nav-messages";

export function AnalysisLayout() {
  const locale = useLocale();

  return (
    <ShellFrame subNav={<SubNav items={getAnalysisSubNav(locale)} label={tNav(locale, "nav.analysis.section")} />}>
      <Outlet />
    </ShellFrame>
  );
}
