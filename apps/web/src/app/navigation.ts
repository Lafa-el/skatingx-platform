export type NavItem = {
  to: string;
  label: string;
  /** Prefix match for nested routes (e.g. /training/tasks). */
  matchPrefix?: boolean;
};

export const primaryNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/training", label: "Training", matchPrefix: true },
  { to: "/analysis", label: "Analysis", matchPrefix: true },
  { to: "/ai-coach", label: "AI Coach" },
  { to: "/settings", label: "Settings" },
];

export const trainingSubNav: NavItem[] = [
  { to: "/training", label: "Home" },
  { to: "/training/tasks", label: "Tasks" },
  { to: "/training/academy", label: "Academy" },
  { to: "/training/records", label: "Records" },
  { to: "/training/shop", label: "Shop" },
];

export const analysisSubNav: NavItem[] = [
  { to: "/analysis", label: "Hub" },
  { to: "/analysis/biomechanics", label: "Biomechanics" },
  { to: "/analysis/pacing", label: "Pacing" },
  { to: "/analysis/equipment", label: "Equipment" },
];

export function isNavActive(
  pathname: string,
  item: NavItem,
): boolean {
  if (item.matchPrefix) {
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }
  return pathname === item.to;
}
