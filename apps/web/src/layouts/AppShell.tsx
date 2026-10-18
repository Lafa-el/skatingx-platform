import { Outlet, useLocation } from "react-router-dom";

import { ShellFrame } from "@/layouts/ShellFrame";

/**
 * Pages already restyled for UI v1 (design doc, section 4). Each phase adds its pages here, and
 * only these get the warm-white page colour. Training, Analysis and Race Day choose in their own
 * layouts.
 */
const ICE_PAGES: readonly string[] = ["/settings"];

export function AppShell() {
  const { pathname } = useLocation();

  return (
    <ShellFrame pageTone={ICE_PAGES.includes(pathname) ? "ice" : "legacy"}>
      <Outlet />
    </ShellFrame>
  );
}
