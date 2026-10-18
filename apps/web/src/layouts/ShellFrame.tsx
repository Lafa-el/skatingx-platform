import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { SideNav } from "@/components/SideNav";
import { isIcePage } from "@/layouts/icePages";

type ShellFrameProps = {
  /** The section's own tabs (Training, Analysis, Race Day), under the header. */
  subNav?: ReactNode;
  /** Extra classes for the content area. */
  mainClassName?: string;
  children: ReactNode;
};

/**
 * Side bar (desktop), header, section tabs, content and bottom bar (phone): shared by every layout.
 * The page colour comes from `ICE_PAGES`, so a page's colour is decided in one place.
 *
 * The side bar and the bottom bar switch at the same breakpoint, `lg` (1024px): below it only the
 * bottom bar shows, from it only the side bar. A test pins that they use the same one, so no
 * width range is left with both or neither.
 */
export function ShellFrame({ subNav, mainClassName = "", children }: ShellFrameProps) {
  const { pathname } = useLocation();

  return (
    // lg:pl-64 clears the fixed side bar (w-64 in SideNav).
    <div className={`flex min-h-dvh flex-col lg:pl-64 ${isIcePage(pathname) ? "bg-brand-ice" : ""}`.trim()}>
      <SideNav />
      <Header />
      {subNav}
      <main
        className={`mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[calc(var(--sx-nav-height)+1.5rem)] lg:pb-6 ${mainClassName}`.trim()}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
