import { Outlet } from "react-router-dom";

import { getTrainingSubNav } from "@/app/navigation";
import { SubNav } from "@/components/SubNav";
import { useLocale } from "@/hooks/useLocale";
import { ShellFrame } from "@/layouts/ShellFrame";
import { tNav } from "@/shared/i18n/nav-messages";

export function TrainingLayout() {
  const locale = useLocale();

  return (
    <ShellFrame subNav={<SubNav items={getTrainingSubNav(locale)} label={tNav(locale, "nav.training.section")} />}>
      <Outlet />
    </ShellFrame>
  );
}
