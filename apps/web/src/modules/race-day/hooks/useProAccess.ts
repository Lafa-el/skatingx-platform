import { useIsPro } from "@/hooks/useIsPro";

export type ProAccess = "loading" | "locked" | "unlocked" | "error";

/**
 * Whether the PRO-only race-day pages open. This is a convenience switch read from the user's
 * own settings, not an entitlement check: Security Rules do not look at it (ADR-001), so it
 * must never be described as protection.
 *
 * "loading" is its own state so a PRO user never sees the locked card flash before the
 * settings arrive. A failed read counts as locked, because opening a page we could not
 * confirm is worse than asking the user to retry.
 */
export function useProAccess(): ProAccess {
  const { isPro, loading, error } = useIsPro();
  if (loading) {
    return "loading";
  }
  if (error) {
    return "error";
  }
  return isPro ? "unlocked" : "locked";
}
