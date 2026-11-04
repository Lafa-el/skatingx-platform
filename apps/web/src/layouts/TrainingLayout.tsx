import { Outlet } from "react-router-dom";

import { getTrainingSubNav } from "@/app/navigation";
import { NoAthleteNotice } from "@/components/NoAthleteNotice";
import { SubNav } from "@/components/SubNav";
import { useActiveAthlete } from "@/hooks/firestore";
import { useLocale } from "@/hooks/useLocale";
import { ShellFrame } from "@/layouts/ShellFrame";
import { tNav } from "@/shared/i18n/nav-messages";

export function TrainingLayout() {
  const locale = useLocale();
  const { athleteId, loading, error } = useActiveAthlete();

  return (
    <ShellFrame subNav={<SubNav items={getTrainingSubNav(locale)} label={tNav(locale, "nav.training.section")} />}>
      {loading || error ? null : athleteId == null ? <NoAthleteNotice /> : <Outlet />}
    </ShellFrame>
  );
}
