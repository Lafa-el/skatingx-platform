import { Outlet } from "react-router-dom";

import { getJournalSubNav } from "@/app/navigation";
import { SubNav } from "@/components/SubNav";
import { useLocale } from "@/hooks/useLocale";
import { tNav } from "@/shared/i18n/nav-messages";

/** Journal tabs only. The training shell already supplies the frame and the athlete gate. */
export function JournalLayout() {
  const locale = useLocale();

  return (
    <>
      <SubNav items={getJournalSubNav(locale)} label={tNav(locale, "nav.journal.section")} />
      <Outlet />
    </>
  );
}
