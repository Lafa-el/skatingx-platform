import type { ReactNode } from "react";

import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { SideNav } from "@/components/SideNav";

type ShellFrameProps = {
  /** The section's own tabs (Training, Analysis, Race Day), under the header. */
  subNav?: ReactNode;
  /**
   * `ice` is the UI v1 page colour. Pages that have not been moved over yet keep `legacy`, because
   * their small grey text was set for a white or light-grey page and is under 4.5:1 on ice. A page
   * moves to `ice` in the same change that restyles it.
   */
  pageTone?: "legacy" | "ice";
  /** Extra classes for the content area. */
  mainClassName?: string;
  children: ReactNode;
};

/** Side bar (desktop), header, section tabs, content and bottom bar (phone): shared by every layout. */
export function ShellFrame({ subNav, pageTone = "legacy", mainClassName = "", children }: ShellFrameProps) {
  return (
    // lg:pl-64 clears the fixed side bar (w-64 in SideNav).
    <div className={`flex min-h-dvh flex-col lg:pl-64 ${pageTone === "ice" ? "bg-brand-ice" : ""}`.trim()}>
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
