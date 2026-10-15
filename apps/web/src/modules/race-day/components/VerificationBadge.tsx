import type { RaceDayVerification } from "@skatingx/schema";

import { useLocale } from "@/hooks/useLocale";

import { t } from "../i18n/messages";

const STYLE: Record<RaceDayVerification, string> = {
  pending: "bg-amber-100 text-amber-900 ring-amber-300",
  verified: "bg-emerald-100 text-emerald-900 ring-emerald-300",
};

/**
 * The "待确认" marker (ADR-001 D5, AGENTS.md "unverified data must be marked"). It is text, not
 * only a color, so it is readable without color vision and by screen readers. Anything that is
 * not exactly "verified" renders as pending: unknown must never look confirmed.
 */
export function VerificationBadge({ verification }: { verification: RaceDayVerification }) {
  const locale = useLocale();
  const state: RaceDayVerification = verification === "verified" ? "verified" : "pending";

  return (
    <span
      data-verification={state}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLE[state]}`}
    >
      {t(locale, state === "verified" ? "raceDay.verification.verified" : "raceDay.verification.pending")}
    </span>
  );
}
