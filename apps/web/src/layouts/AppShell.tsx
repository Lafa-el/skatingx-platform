import { Outlet } from "react-router-dom";

import { ShellFrame } from "@/layouts/ShellFrame";

export function AppShell() {
  return (
    <ShellFrame>
      <Outlet />
    </ShellFrame>
  );
}
