import { Outlet } from "react-router-dom";

import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[calc(var(--sx-nav-height)+1.5rem)]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
