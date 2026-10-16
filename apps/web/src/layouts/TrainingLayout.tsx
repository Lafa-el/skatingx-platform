import { Outlet } from "react-router-dom";

import { getTrainingSubNav } from "@/app/navigation";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { SubNav } from "@/components/SubNav";
import { useLocale } from "@/hooks/useLocale";
import { tNav } from "@/shared/i18n/nav-messages";

export function TrainingLayout() {
  const locale = useLocale();

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <SubNav items={getTrainingSubNav(locale)} label={tNav(locale, "nav.training.section")} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[calc(var(--sx-nav-height)+1.5rem)]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
